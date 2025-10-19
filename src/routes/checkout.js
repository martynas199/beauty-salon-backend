import { Router } from "express";
import Stripe from "stripe";
import Service from "../models/Service.js";
import Beautician from "../models/Beautician.js";
import Appointment from "../models/Appointment.js";

const r = Router();
let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET;
    if (!key) throw new Error("STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

function toMinorUnits(amountFloat) {
  // Convert e.g. 12.34 (GBP) -> 1234 (pence)
  return Math.round((Number(amountFloat) || 0) * 100);
}

r.get("/confirm", async (req, res, next) => {
  try {
    const stripe = getStripe();
    const { session_id } = req.query || {};
    console.log("[CHECKOUT CONFIRM] called with session_id:", session_id);
    if (!session_id)
      return res.status(400).json({ error: "Missing session_id" });
    const session = await stripe.checkout.sessions.retrieve(
      String(session_id),
      { expand: ["payment_intent"] }
    );
    console.log("[CHECKOUT CONFIRM] Stripe session:", session);
    const apptId =
      session.client_reference_id ||
      session.metadata?.appointmentId ||
      session.payment_intent?.metadata?.appointmentId;
    console.log("[CHECKOUT CONFIRM] Resolved apptId:", apptId);
    if (!apptId)
      return res.status(404).json({ error: "Appointment not linked" });

    const appt = await Appointment.findById(apptId).lean();
    console.log("[CHECKOUT CONFIRM] Appointment:", appt);
    if (!appt) return res.status(404).json({ error: "Appointment not found" });

    // If already confirmed, exit early
    if (
      [
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
        "confirmed",
      ].includes(appt.status)
    ) {
      console.log(
        "[CHECKOUT CONFIRM] Already confirmed or cancelled, status:",
        appt.status
      );
      return res.json({ ok: true, status: appt.status });
    }

    const paid =
      session.payment_status === "paid" || session.status === "complete";
    console.log(
      "[CHECKOUT CONFIRM] paid:",
      paid,
      "payment_status:",
      session.payment_status,
      "status:",
      session.status
    );
    if (!paid)
      return res
        .status(409)
        .json({
          error: "Session not paid yet",
          session: {
            payment_status: session.payment_status,
            status: session.status,
          },
        });

    const pi = session.payment_intent;
    const amountTotal = Number(
      session.amount_total ||
        appt.payment?.amountTotal ||
        Math.round(Number(appt.price || 0) * 100)
    );
    console.log("[CHECKOUT CONFIRM] amountTotal:", amountTotal);

    await Appointment.findByIdAndUpdate(apptId, {
      $set: {
        status: "confirmed",
        payment: {
          ...(appt.payment || {}),
          provider: "stripe",
          mode: "pay_now",
          status: "succeeded",
          amountTotal,
          stripe: {
            ...(appt.payment?.stripe || {}),
            paymentIntentId:
              typeof pi === "object" && pi?.id
                ? pi.id
                : typeof session.payment_intent === "string"
                ? session.payment_intent
                : undefined,
          },
        },
      },
      $push: {
        audit: {
          at: new Date(),
          action: "checkout_confirm_reconcile",
          meta: { sessionId: session.id },
        },
      },
    });
    console.log("[CHECKOUT CONFIRM] Appointment updated to confirmed.");
    res.json({ ok: true, status: "confirmed" });
  } catch (err) {
    console.error("[CHECKOUT CONFIRM] Error:", err);
    next(err);
  }
});

r.post("/create-session", async (req, res, next) => {
  try {
    const stripe = getStripe();

    const { appointmentId, mode } = req.body || {};
    let appt = null;
    let service = null;

    if (appointmentId) {
      appt = await Appointment.findById(appointmentId).lean();
      if (!appt)
        return res.status(404).json({ error: "Appointment not found" });
      if (appt.status !== "reserved_unpaid")
        return res
          .status(400)
          .json({ error: "Appointment not in payable state" });
      service = await Service.findById(appt.serviceId).lean();
      if (!service) return res.status(404).json({ error: "Service not found" });
    } else {
      // Create a reserved-unpaid appointment first (same logic as /api/appointments)
      const { beauticianId, any, serviceId, variantName, startISO, client } =
        req.body || {};
      service = await Service.findById(serviceId).lean();
      if (!service) return res.status(404).json({ error: "Service not found" });
      const variant = (service.variants || []).find(
        (v) => v.name === variantName
      );
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
      appt = await Appointment.create({
        client,
        beauticianId: beautician._id,
        serviceId,
        variantName,
        start,
        end,
        price: variant.price,
        status: "reserved_unpaid",
      });
      appt = appt.toObject();
    }

    const currency = (process.env.STRIPE_CURRENCY || "gbp").toLowerCase();
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    const depositPct = Number(process.env.STRIPE_DEPOSIT_PERCENT || 0);

    const isDepositRequested = String(mode).toLowerCase() === "deposit";
    const isDeposit = isDepositRequested && depositPct > 0 && depositPct < 100;
    if (isDepositRequested && !isDeposit) {
      return res.status(400).json({
        error:
          "Deposit mode requested but STRIPE_DEPOSIT_PERCENT not configured (1-99)",
      });
    }
    const baseAmount = Number(appt.price || 0);
    const amountToPay = isDeposit
      ? (baseAmount * depositPct) / 100
      : baseAmount;

    const unit_amount = toMinorUnits(amountToPay);
    if (unit_amount < 1)
      return res.status(400).json({ error: "Invalid amount" });

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      client_reference_id: String(appt._id),
      customer_email: appt?.client?.email || undefined,
      success_url: `${frontend}/success?appointmentId=${appt._id}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/cancel?appointmentId=${appt._id}`,
      payment_intent_data: {
        metadata: {
          appointmentId: String(appt._id),
          type: isDeposit ? "deposit" : "full",
        },
      },
      metadata: {
        appointmentId: String(appt._id),
        type: isDeposit ? "deposit" : "full",
      },
      line_items: [
        {
          price_data: {
            currency,
            unit_amount,
            product_data: {
              name: `${service.name} - ${appt.variantName}`,
              description: isDeposit
                ? `Deposit payment (${depositPct}% of total ${baseAmount.toFixed(
                    2
                  )})`
                : `Full payment (total ${baseAmount.toFixed(2)})`,
            },
          },
          quantity: 1,
        },
      ],
      allow_promotion_codes: true,
    });

    await Appointment.findByIdAndUpdate(appt._id, {
      $set: {
        payment: {
          provider: "stripe",
          sessionId: session.id,
          status: "pending",
          amountTotal: unit_amount, // Save intended amount in minor units (e.g. pence)
        },
      },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    next(err);
  }
});

export default r;
