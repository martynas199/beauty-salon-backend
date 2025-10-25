import { Router } from "express";
import Service from "../models/Service.js";
import Beautician from "../models/Beautician.js";
import Appointment from "../models/Appointment.js";
import CancellationPolicy from "../models/CancellationPolicy.js";
import { z } from "zod";
import { computeCancellationOutcome } from "../controllers/appointments/computeCancellationOutcome.js";
import { refundPayment } from "../payments/stripe.js";
import {
  sendCancellationEmails,
  sendConfirmationEmail,
} from "../emails/mailer.js";
const r = Router();
r.get("/", async (req, res) => {
  const list = await Appointment.find()
    .sort({ start: -1 })
    .populate({ path: "serviceId", select: "name" })
    .populate({ path: "beauticianId", select: "name" })
    .lean();
  const rows = list.map((a) => ({
    ...a,
    service:
      a.serviceId && typeof a.serviceId === "object" && a.serviceId._id
        ? a.serviceId
        : null,
    beautician:
      a.beauticianId && typeof a.beauticianId === "object" && a.beauticianId._id
        ? a.beauticianId
        : null,
  }));
  res.json(rows);
});
r.get("/:id", async (req, res) => {
  const { id } = req.params;
  const a = await Appointment.findById(id).lean();
  if (!a) return res.status(404).json({ error: "Appointment not found" });
  const [s, b] = await Promise.all([
    Service.findById(a.serviceId).lean(),
    Beautician.findById(a.beauticianId).lean(),
  ]);
  res.json({ ...a, service: s || null, beautician: b || null });
});
r.post("/", async (req, res) => {
  const { beauticianId, any, serviceId, variantName, startISO, client, mode } =
    req.body;
  const service = await Service.findById(serviceId).lean();
  if (!service) return res.status(404).json({ error: "Service not found" });
  const variant = (service.variants || []).find((v) => v.name === variantName);
  if (!variant) return res.status(404).json({ error: "Variant not found" });
  let beautician = null;
  if (any) {
    beautician = await Beautician.findOne({
      _id: { $in: service.beauticianIds },
      active: true,
    }).lean();
  } else {
    beautician = await Beautician.findById(beauticianId).lean();
  }
  if (!beautician)
    return res.status(400).json({ error: "No beautician available" });
  const start = new Date(startISO);
  const end = new Date(
    start.getTime() +
      (variant.durationMin +
        (variant.bufferBeforeMin || 0) +
        (variant.bufferAfterMin || 0)) *
        60000
  );
  const conflict = await Appointment.findOne({
    beauticianId: beautician._id,
    start: { $lt: end },
    end: { $gt: start },
  }).lean();
  if (conflict)
    return res.status(409).json({ error: "Slot no longer available" });
  const isInSalon = String(mode).toLowerCase() === "pay_in_salon";
  const status = isInSalon ? "confirmed" : "reserved_unpaid";
  const payment = isInSalon
    ? {
        mode: "pay_in_salon",
        provider: "cash",
        status: "unpaid",
        amountTotal: Math.round(Number(variant.price || 0) * 100),
      }
    : undefined;
  const appt = await Appointment.create({
    client,
    beauticianId: beautician._id,
    serviceId,
    variantName,
    start,
    end,
    price: variant.price,
    status,
    ...(payment ? { payment } : {}),
  });

  // Send confirmation email to customer
  sendConfirmationEmail({
    appointment: appt.toObject(),
    service,
    beautician,
  }).catch((err) => {
    console.error("Failed to send confirmation email:", err);
  });

  res.json({ ok: true, appointmentId: appt._id });
});

// Cancellation routes
r.post("/:id/cancel", async (req, res) => {
  const IdSchema = z.object({ id: z.string() });
  const BodySchema = z.object({
    requestedBy: z.enum(["customer", "staff"]),
    reason: z.string().optional(),
  });
  try {
    const { id } = IdSchema.parse(req.params);
    const body = BodySchema.parse(req.body || {});
    const salonTz = process.env.SALON_TZ || "Europe/London";
    const appt = await Appointment.findById(id).lean();
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    if (
      [
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
      ].includes(appt.status)
    ) {
      return res.json({
        outcome: appt.status.replace("cancelled_", ""),
        refundAmount: 0,
        status: appt.status,
        alreadyCancelled: true,
      });
    }
    const policy = (await CancellationPolicy.findOne({
      scope: "beautician",
      beauticianId: appt.beauticianId,
    }).lean()) ||
      (await CancellationPolicy.findOne({ scope: "salon" }).lean()) || {
        freeCancelHours: 24,
        noRefundHours: 2,
        partialRefund: { percent: 50 },
        appliesTo: "deposit_only",
        graceMinutes: 15,
        currency: "GBP",
      };
    const outcome = computeCancellationOutcome({
      appointment: appt,
      policy,
      now: new Date(),
      salonTz,
    });
    let stripeRefundId;
    if (outcome.refundAmount > 0 && appt.payment?.provider === "stripe") {
      const key = `cancel:${id}:${new Date(
        appt.updatedAt || appt.createdAt || Date.now()
      ).getTime()}`;
      const ref = appt.payment?.stripe || {};
      try {
        const rf = await refundPayment({
          paymentIntentId: ref.paymentIntentId,
          chargeId: ref.chargeId,
          amount: outcome.refundAmount,
          idempotencyKey: key,
        });
        stripeRefundId = rf.id;
      } catch (e) {
        console.error("Refund error", { id, err: e.message });
        return res
          .status(502)
          .json({ error: "Refund failed", details: e.message });
      }
    }
    const newStatus =
      outcome.refundAmount > 0 ? outcome.outcomeStatus : "cancelled_no_refund";
    const update = {
      $set: {
        status: newStatus,
        cancelledAt: new Date(),
        cancelledBy: body.requestedBy,
        cancelReason: body.reason,
        policySnapshot: policy,
      },
      $push: {
        audit: {
          at: new Date(),
          action: "cancel",
          by: body.requestedBy,
          meta: { outcome, stripeRefundId },
        },
      },
    };
    if (stripeRefundId) {
      update.$set["payment.status"] =
        outcome.refundAmount === (appt.payment?.amountTotal || 0)
          ? "refunded"
          : "partial_refunded";
      update.$set["payment.stripe.refundIds"] = [
        ...(appt.payment?.stripe?.refundIds || []),
        stripeRefundId,
      ];
    }
    const updated = await Appointment.findOneAndUpdate(
      { _id: id, status: { $in: ["confirmed", "reserved_unpaid"] } },
      update,
      { new: true }
    ).lean();
    if (!updated) {
      const cur = await Appointment.findById(id).lean();
      return res.json({
        outcome: cur?.status?.replace("cancelled_", "") || "no_refund",
        refundAmount: outcome.refundAmount,
        status: cur?.status || "unknown",
        alreadyProcessed: true,
      });
    }
    try {
      await sendCancellationEmails({
        appointment: updated,
        policySnapshot: policy,
        refundAmount: outcome.refundAmount,
        outcomeStatus: newStatus,
        reason: body.reason,
      });
    } catch (e) {
      console.error("email_err", e.message);
    }
    res.json({
      outcome: newStatus.replace("cancelled_", ""),
      refundAmount: outcome.refundAmount,
      status: newStatus,
      stripeRefundId,
    });
  } catch (err) {
    console.error("cancel_err", err);
    res.status(400).json({ error: err.message || "Bad Request" });
  }
});

r.get("/:id/cancel/preview", async (req, res) => {
  const IdSchema = z.object({ id: z.string() });
  try {
    const { id } = IdSchema.parse(req.params);
    const appt = await Appointment.findById(id).lean();
    if (!appt) return res.status(404).json({ error: "Appointment not found" });
    const policy = (await CancellationPolicy.findOne({
      scope: "beautician",
      beauticianId: appt.beauticianId,
    }).lean()) ||
      (await CancellationPolicy.findOne({ scope: "salon" }).lean()) || {
        freeCancelHours: 24,
        noRefundHours: 2,
        partialRefund: { percent: 50 },
        appliesTo: "deposit_only",
        graceMinutes: 15,
        currency: "GBP",
      };
    const outcome = computeCancellationOutcome({
      appointment: appt,
      policy,
      now: new Date(),
      salonTz: process.env.SALON_TZ || "Europe/London",
    });
    res.json({
      refundAmount: outcome.refundAmount,
      status: outcome.outcomeStatus,
      policy,
    });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

r.patch("/:id/status", async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    // Validate status
    const validStatuses = [
      "reserved_unpaid",
      "confirmed",
      "cancelled_no_refund",
      "cancelled_partial_refund",
      "cancelled_full_refund",
      "no_show",
    ];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    appointment.status = status;
    await appointment.save();

    res.json({ success: true, status: appointment.status });
  } catch (err) {
    console.error("status_update_err", err);
    res.status(400).json({ error: err.message || "Failed to update status" });
  }
});

r.patch("/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { client, beauticianId, serviceId, variantName, start, end, price } =
      req.body;

    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Check if time slot is available for the new time/beautician
    if (start && beauticianId) {
      const appointmentStart = new Date(start);
      const appointmentEnd = end
        ? new Date(end)
        : new Date(appointmentStart.getTime() + 60 * 60000); // default 1 hour if no end

      const conflict = await Appointment.findOne({
        _id: { $ne: id }, // exclude current appointment
        beauticianId: beauticianId,
        start: { $lt: appointmentEnd },
        end: { $gt: appointmentStart },
      }).lean();

      if (conflict) {
        return res
          .status(409)
          .json({ error: "Time slot not available for this beautician" });
      }
    }

    // Update fields if provided
    if (client) appointment.client = { ...appointment.client, ...client };
    if (beauticianId) appointment.beauticianId = beauticianId;
    if (serviceId) appointment.serviceId = serviceId;
    if (variantName) appointment.variantName = variantName;
    if (start) appointment.start = new Date(start);
    if (end) appointment.end = new Date(end);
    if (price !== undefined) appointment.price = price;

    await appointment.save();

    // Return populated appointment
    const updated = await Appointment.findById(id)
      .populate({ path: "serviceId", select: "name" })
      .populate({ path: "beauticianId", select: "name" })
      .lean();

    res.json({
      success: true,
      appointment: {
        ...updated,
        service:
          updated.serviceId && typeof updated.serviceId === "object"
            ? updated.serviceId
            : null,
        beautician:
          updated.beauticianId && typeof updated.beauticianId === "object"
            ? updated.beauticianId
            : null,
      },
    });
  } catch (err) {
    console.error("appointment_update_err", err);
    res
      .status(400)
      .json({ error: err.message || "Failed to update appointment" });
  }
});

export default r;
