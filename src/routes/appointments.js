import { Router } from "express";
import Service from "../models/Service.js";
import Beautician from "../models/Beautician.js";
import Appointment from "../models/Appointment.js";
import CancellationPolicy from "../models/CancellationPolicy.js";
import { z } from "zod";
import { computeCancellationOutcome } from "../controllers/appointments/computeCancellationOutcome.js";
import { refundPayment, getStripe } from "../payments/stripe.js";
import {
  sendCancellationEmails,
  sendConfirmationEmail,
  sendDepositPaymentEmail,
  sendBookingFeeEmail,
} from "../emails/mailer.js";
const r = Router();

r.get("/", async (req, res) => {
  try {
    // Check if pagination is requested
    const usePagination = req.query.page !== undefined;

    if (usePagination) {
      // Parse pagination params
      const page = Math.max(1, parseInt(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
      const skip = (page - 1) * limit;

      // Get total count for pagination metadata
      const total = await Appointment.countDocuments();

      // Get paginated appointments
      const list = await Appointment.find()
        .sort({ start: -1 })
        .skip(skip)
        .limit(limit)
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
          a.beauticianId &&
          typeof a.beauticianId === "object" &&
          a.beauticianId._id
            ? a.beauticianId
            : null,
      }));

      // Return paginated response
      res.json({
        data: rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: page * limit < total,
        },
      });
    } else {
      // Backward compatibility: return array if no page param
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
          a.beauticianId &&
          typeof a.beauticianId === "object" &&
          a.beauticianId._id
            ? a.beauticianId
            : null,
      }));

      res.json(rows);
    }
  } catch (err) {
    console.error("appointments_list_err", err);
    res.status(500).json({ error: "Failed to fetch appointments" });
  }
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
  const {
    beauticianId,
    any,
    serviceId,
    variantName,
    startISO,
    client,
    mode,
    userId,
  } = req.body;

  console.log("[APPOINTMENT] Creating new appointment with:", {
    beauticianId,
    any,
    serviceId,
    variantName,
    startISO,
    client,
    mode,
    userId,
  });
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

  console.log("[APPOINTMENT] Beautician:", {
    id: beautician._id.toString(),
    name: beautician.name,
    stripeAccountId: beautician.stripeAccountId,
    hasNoFeeSubscription:
      beautician.subscription?.noFeeBookings?.enabled === true &&
      beautician.subscription?.noFeeBookings?.status === "active",
  });
  console.log("[APPOINTMENT] Service:", {
    id: service._id.toString(),
    name: service.name,
    variant: variant.name,
    price: variant.price,
    duration: variant.durationMin,
  });

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

  const modeStr = String(mode).toLowerCase();
  const isInSalon = modeStr === "pay_in_salon";
  const isDeposit = modeStr === "deposit";
  let isBookingFee = modeStr === "booking_fee";

  // Check if beautician has no-fee bookings subscription active
  const hasNoFeeSubscription =
    beautician.subscription?.noFeeBookings?.enabled === true &&
    beautician.subscription?.noFeeBookings?.status === "active";

  // If beautician has subscription, skip booking fee and treat as confirmed
  const skipBookingFee = isBookingFee && hasNoFeeSubscription;
  if (skipBookingFee) {
    console.log(
      "[APPOINTMENT] Beautician has no-fee subscription, skipping booking fee"
    );
  }

  const status = isInSalon || skipBookingFee ? "confirmed" : "reserved_unpaid";

  let payment = undefined;
  if (isInSalon) {
    payment = {
      mode: "pay_in_salon",
      provider: "cash",
      status: "unpaid",
      amountTotal: Math.round(Number(variant.price || 0) * 100),
    };
  } else if (isDeposit) {
    payment = {
      mode: "deposit",
      provider: "stripe",
      status: "unpaid",
      amountTotal: Math.round(Number(variant.price || 0) * 100),
    };
  } else if (isBookingFee && !skipBookingFee) {
    // Only charge booking fee if subscription is not active
    payment = {
      mode: "booking_fee",
      provider: "stripe",
      status: "unpaid",
      amountTotal: 100, // Only £1.00 booking fee (in pence)
    };
  }

  const appointmentDoc = {
    client,
    beauticianId: beautician._id,
    serviceId,
    variantName,
    start,
    end,
    price: variant.price,
    status,
    ...(userId ? { userId } : {}), // Add userId if provided (logged-in users)
    ...(payment ? { payment } : {}),
  };

  console.log(
    "[APPOINTMENT] Creating document:",
    JSON.stringify(
      {
        client,
        beauticianId: beautician._id.toString(),
        serviceId: serviceId.toString(),
        variantName,
        start: start.toISOString(),
        end: end.toISOString(),
        price: variant.price,
        status,
        userId: userId || null,
        payment,
      },
      null,
      2
    )
  );

  const appt = await Appointment.create(appointmentDoc);

  // Ensure the appointment is actually saved before proceeding
  const savedAppt = await Appointment.findById(appt._id);
  if (!savedAppt) {
    console.error(
      "[APPOINTMENT] Failed to verify appointment creation:",
      appt._id
    );
    return res.status(500).json({ error: "Failed to create appointment" });
  }

  console.log("[APPOINTMENT] Created appointment:", appt._id.toString());

  // Handle deposit mode: create checkout session and send email
  if (isDeposit) {
    try {
      // Check if beautician has Stripe Connect
      if (!beautician.stripeAccountId) {
        console.error("Beautician has no Stripe account for deposit");
        // Still create appointment but don't send payment link
        return res.json({
          ok: true,
          appointmentId: appt._id,
          warning:
            "Beautician has no Stripe account. Cannot send deposit payment link.",
        });
      }

      // Calculate deposit amount (default 50% of service price, can be customized)
      const depositPercent = Number(req.body.depositPercent || 50);
      const depositAmount = Number(variant.price || 0) * (depositPercent / 100);
      const platformFee = 0.5; // £0.50 booking fee
      const totalAmount = depositAmount + platformFee;

      // Create Stripe Checkout Session
      const stripe = getStripe();

      // Build line items - include booking fee only if no subscription
      const lineItems = [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `Deposit for ${service.name} - ${variant.name}`,
              description: `With ${beautician.name}`,
            },
            unit_amount: Math.round(depositAmount * 100),
          },
          quantity: 1,
        },
      ];

      // Add booking fee only if beautician doesn't have no-fee subscription
      if (!hasNoFeeSubscription) {
        lineItems.push({
          price_data: {
            currency: "gbp",
            product_data: {
              name: "Booking Fee",
              description: "Platform booking fee",
            },
            unit_amount: Math.round(platformFee * 100),
          },
          quantity: 1,
        });
      }

      console.log("[DEPOSIT] Creating Stripe session:", {
        appointmentId: appt._id.toString(),
        depositAmount,
        platformFee: hasNoFeeSubscription ? 0 : platformFee,
        totalAmount: hasNoFeeSubscription ? depositAmount : totalAmount,
        stripeAccountId: beautician.stripeAccountId,
        customerEmail: client.email,
      });

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: lineItems,
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/booking/${appt._id}/deposit-success`,
        cancel_url: `${process.env.FRONTEND_URL}/booking/${appt._id}/deposit-cancel`,
        customer_email: client.email,
        metadata: {
          appointmentId: appt._id.toString(),
          type: "manual_appointment_deposit",
          hasNoFeeSubscription: hasNoFeeSubscription.toString(),
        },
        payment_intent_data: {
          application_fee_amount: hasNoFeeSubscription
            ? 0
            : Math.round(platformFee * 100),
          transfer_data: {
            destination: beautician.stripeAccountId,
          },
          statement_descriptor: "NOBLE ELEGANCE",
          statement_descriptor_suffix: "DEPOSIT",
        },
      });

      console.log("[DEPOSIT] Created Stripe session:", {
        sessionId: session.id,
        appointmentId: appt._id.toString(),
        url: session.url,
      });

      // Update appointment with checkout details
      appt.payment.checkoutSessionId = session.id;
      appt.payment.checkoutUrl = session.url;

      try {
        await appt.save();
        console.log("[DEPOSIT] Appointment saved with session ID:", session.id);
      } catch (saveError) {
        console.error("[DEPOSIT] Failed to save appointment:", saveError);
        // Try to update via findByIdAndUpdate as fallback
        await Appointment.findByIdAndUpdate(appt._id, {
          $set: {
            "payment.checkoutSessionId": session.id,
            "payment.checkoutUrl": session.url,
          },
        });
        console.log("[DEPOSIT] Updated appointment via findByIdAndUpdate");
      }

      // Send deposit payment email
      console.log("[DEPOSIT] Sending deposit payment email to:", client.email);
      try {
        await sendDepositPaymentEmail({
          appointment: appt.toObject(),
          service,
          beautician,
          depositAmount,
          platformFee: hasNoFeeSubscription ? 0 : platformFee,
          totalAmount: hasNoFeeSubscription ? depositAmount : totalAmount,
          remainingBalance: Number(variant.price || 0) - depositAmount,
          checkoutUrl: session.url,
          hasNoFeeSubscription,
        });
        console.log("[DEPOSIT] Email sent successfully");
      } catch (emailError) {
        console.error("[DEPOSIT] Failed to send email:", emailError);
        // Don't fail the request if email fails
      }

      return res.json({ ok: true, appointmentId: appt._id });
    } catch (depositError) {
      console.error("Failed to create deposit checkout:", depositError);
      // Appointment already created, just return it
      return res.json({
        ok: true,
        appointmentId: appt._id,
        warning: "Appointment created but failed to send deposit payment link.",
      });
    }
  }

  // Handle booking fee mode: create checkout session for £1.00 booking fee only
  if (isBookingFee && !skipBookingFee) {
    try {
      const bookingFeeAmount = 1.0; // £1.00

      // Create Stripe Checkout Session for booking fee only (no Connect account needed)
      console.log("[BOOKING FEE] Creating Stripe session:", {
        appointmentId: appt._id.toString(),
        amount: bookingFeeAmount,
        customerEmail: client.email,
      });

      const stripe = getStripe();
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "gbp",
              product_data: {
                name: "Booking Fee",
                description: `Booking fee for ${service.name} - ${variant.name} with ${beautician.name}`,
              },
              unit_amount: Math.round(bookingFeeAmount * 100), // £1.00 in pence
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        success_url: `${process.env.FRONTEND_URL}/booking/${appt._id}/deposit-success?type=booking_fee`,
        cancel_url: `${process.env.FRONTEND_URL}/booking/${appt._id}/deposit-cancel`,
        customer_email: client.email,
        metadata: {
          appointmentId: appt._id.toString(),
          type: "booking_fee",
        },
        payment_intent_data: {
          statement_descriptor: "NOBLE ELEGANCE",
          statement_descriptor_suffix: "BOOKING",
        },
      });

      console.log("[BOOKING FEE] Created Stripe session:", {
        sessionId: session.id,
        appointmentId: appt._id.toString(),
        url: session.url,
      });

      // Update appointment with checkout details
      appt.payment.checkoutSessionId = session.id;
      appt.payment.checkoutUrl = session.url;
      await appt.save();

      console.log("[BOOKING FEE] Updated appointment with session");

      // Send booking fee payment email (we'll create this function)
      await sendBookingFeeEmail({
        appointment: appt.toObject(),
        service,
        beautician,
        bookingFeeAmount,
        checkoutUrl: session.url,
      });

      return res.json({ ok: true, appointmentId: appt._id });
    } catch (bookingFeeError) {
      console.error("Failed to create booking fee checkout:", bookingFeeError);
      // Appointment already created, just return it
      return res.json({
        ok: true,
        appointmentId: appt._id,
        warning:
          "Appointment created but failed to send booking fee payment link.",
      });
    }
  }

  // Send confirmation email to customer (for non-deposit/non-booking-fee appointments)
  sendConfirmationEmail({
    appointment: appt.toObject(),
    service,
    beautician,
  }).catch((err) => {
    console.error("Failed to send confirmation email:", err);
  });

  res.json({ ok: true, appointmentId: appt._id });
});

// Create deposit checkout session for manual appointment
r.post("/:id/create-deposit-checkout", async (req, res) => {
  try {
    const { id } = req.params;
    const { depositAmount } = req.body; // Amount in main currency (e.g., 10.00 for £10)

    const appt = await Appointment.findById(id);
    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Get service and beautician info
    const [service, beautician] = await Promise.all([
      Service.findById(appt.serviceId).lean(),
      Beautician.findById(appt.beauticianId).lean(),
    ]);

    if (!service || !beautician) {
      return res.status(400).json({ error: "Service or beautician not found" });
    }

    // Check if beautician has Stripe Connect
    if (!beautician.stripeAccountId) {
      return res
        .status(400)
        .json({ error: "Beautician has no Stripe account" });
    }

    const stripe = getStripe();
    const platformFee = Number(process.env.STRIPE_PLATFORM_FEE || 50); // £0.50 in pence
    const depositAmountInPence = Math.round(Number(depositAmount) * 100);

    // Check if beautician has no-fee subscription
    const hasNoFeeSubscription =
      beautician.subscription?.noFeeBookings?.enabled === true &&
      beautician.subscription?.noFeeBookings?.status === "active";

    const totalAmountInPence = hasNoFeeSubscription
      ? depositAmountInPence
      : depositAmountInPence + platformFee;

    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // Build line items - include booking fee only if no subscription
    const lineItems = [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: `${service.name}${
              appt.variantName ? ` - ${appt.variantName}` : ""
            }`,
            description: `Deposit for ${service.name} with ${beautician.name}`,
          },
          unit_amount: depositAmountInPence,
        },
        quantity: 1,
      },
    ];

    // Add booking fee only if beautician doesn't have no-fee subscription
    if (!hasNoFeeSubscription) {
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: "Booking Fee",
            description: "Platform booking fee",
          },
          unit_amount: platformFee,
        },
        quantity: 1,
      });
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: lineItems,
      payment_intent_data: {
        application_fee_amount: hasNoFeeSubscription ? 0 : platformFee,
        transfer_data: {
          destination: beautician.stripeAccountId,
        },
      },
      success_url: `${frontendUrl}/booking/${id}/deposit-success`,
      cancel_url: `${frontendUrl}/booking/${id}/deposit-cancel`,
      metadata: {
        appointmentId: id.toString(),
        beauticianId: beautician._id.toString(),
        depositAmount: depositAmountInPence.toString(),
        platformFee: platformFee.toString(),
        type: "manual_appointment_deposit",
      },
    });

    // Update appointment with checkout session info
    appt.payment = {
      mode: "deposit",
      provider: "stripe",
      status: "unpaid",
      checkoutSessionId: session.id,
      checkoutUrl: session.url,
      amountDeposit: depositAmountInPence,
      amountTotal: totalAmountInPence,
      amountBalance: Math.round(appt.price * 100) - depositAmountInPence,
      stripe: {
        platformFee,
        beauticianStripeAccount: beautician.stripeAccountId,
      },
    };
    // Keep status as confirmed for manually created appointments (staff-created)
    // Don't change to reserved_unpaid as these are confirmed bookings where payment comes later
    // Status is only reserved_unpaid for customer-initiated online bookings requiring immediate payment
    if (appt.status !== "confirmed") {
      appt.status = "confirmed";
    }
    await appt.save();

    res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("Error creating deposit checkout session:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to create checkout session" });
  }
});

// Send deposit payment email
r.post("/:id/send-deposit-email", async (req, res) => {
  try {
    const { id } = req.params;
    const appt = await Appointment.findById(id);

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    if (!appt.payment?.checkoutUrl) {
      return res.status(400).json({
        error: "No payment link available. Create checkout session first.",
      });
    }

    const [service, beautician] = await Promise.all([
      Service.findById(appt.serviceId).lean(),
      Beautician.findById(appt.beauticianId).lean(),
    ]);

    // Calculate deposit amounts
    const variant = service.variants.find((v) => v.name === appt.variantName);
    const variantPrice = Number(variant?.price || 0);
    const depositPercent = Number(appt.payment?.depositPercent || 50);
    const depositAmount = (variantPrice * depositPercent) / 100;
    const platformFee = 0.5;
    const totalAmount = depositAmount + platformFee;
    const remainingBalance = variantPrice - depositAmount;

    // Send deposit payment email
    const { sendDepositPaymentEmail } = await import("../emails/mailer.js");
    await sendDepositPaymentEmail({
      appointment: appt.toObject(),
      service,
      beautician,
      depositAmount,
      platformFee,
      totalAmount,
      remainingBalance,
    });

    res.json({ ok: true, message: "Deposit payment email sent" });
  } catch (err) {
    console.error("Error sending deposit email:", err);
    res.status(500).json({ error: err.message || "Failed to send email" });
  }
});

// Request remaining balance payment (for deposits where deposit was paid)
r.post("/:id/request-remaining-balance", async (req, res) => {
  try {
    const { id } = req.params;
    const appt = await Appointment.findById(id);

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Verify this is a deposit payment that was paid
    if (appt.payment?.mode !== "deposit") {
      return res.status(400).json({ error: "Not a deposit payment" });
    }

    if (appt.payment?.status !== "succeeded") {
      return res.status(400).json({ error: "Deposit not yet paid" });
    }

    // Get service and beautician info
    const [service, beautician] = await Promise.all([
      Service.findById(appt.serviceId).lean(),
      Beautician.findById(appt.beauticianId).lean(),
    ]);

    if (!service || !beautician) {
      return res.status(400).json({ error: "Service or beautician not found" });
    }

    // Check if beautician has Stripe Connect
    if (!beautician.stripeAccountId) {
      return res
        .status(400)
        .json({ error: "Beautician has no Stripe account" });
    }

    // Calculate remaining balance
    // amountTotal includes deposit + booking fee (50p)
    // So actual deposit paid = amountTotal - 50p
    const variant = service.variants.find((v) => v.name === appt.variantName);
    const variantPrice = Number(variant?.price || 0);
    const platformFee = Number(process.env.STRIPE_PLATFORM_FEE || 50); // 50 pence
    const amountTotalPence = Number(appt.payment?.amountTotal || 0);
    const depositPaidPence =
      amountTotalPence > platformFee
        ? amountTotalPence - platformFee
        : amountTotalPence;
    const depositPaid = depositPaidPence / 100;
    const remainingBalance = variantPrice - depositPaid;

    if (remainingBalance <= 0) {
      return res.status(400).json({ error: "No remaining balance" });
    }

    const stripe = getStripe();
    const remainingBalanceInPence = Math.round(remainingBalance * 100);
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";

    // No additional booking fee - deposit already included the booking fee
    // Create Stripe Checkout Session for remaining balance (100% to beautician)
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "gbp",
            product_data: {
              name: `${service.name}${
                appt.variantName ? ` - ${appt.variantName}` : ""
              }`,
              description: `Remaining balance for ${service.name} with ${beautician.name}`,
            },
            unit_amount: remainingBalanceInPence,
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        application_fee_amount: 0, // No platform fee for remaining balance
        transfer_data: {
          destination: beautician.stripeAccountId,
        },
      },
      success_url: `${frontendUrl}/booking/${id}/balance-paid`,
      cancel_url: `${frontendUrl}/booking/${id}/deposit-cancel`,
      metadata: {
        appointmentId: id.toString(),
        beauticianId: beautician._id.toString(),
        remainingBalance: remainingBalanceInPence.toString(),
        platformFee: "0",
        type: "remaining_balance",
      },
    });

    // Send remaining balance payment email
    const { sendRemainingBalanceEmail } = await import("../emails/mailer.js");
    await sendRemainingBalanceEmail({
      appointment: appt.toObject(),
      service,
      beautician,
      remainingBalance,
      checkoutUrl: session.url,
    });

    res.json({
      ok: true,
      message: "Remaining balance email sent",
      checkoutUrl: session.url,
    });
  } catch (err) {
    console.error("Error requesting remaining balance:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to request remaining balance" });
  }
});

// TEMPORARY: Manual deposit confirmation (for local testing without webhooks)
// TODO: Remove this in production - webhooks should handle this
r.post("/:id/confirm-deposit-payment", async (req, res) => {
  try {
    const { id } = req.params;

    const appt = await Appointment.findById(id)
      .populate("serviceId")
      .populate("beauticianId");

    if (!appt) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Retrieve payment intent from Stripe if we have a checkout session
    if (appt.payment?.checkoutSessionId) {
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(
          appt.payment.checkoutSessionId
        );
        if (session.payment_intent) {
          appt.payment.stripe = appt.payment.stripe || {};
          appt.payment.stripe.paymentIntentId = session.payment_intent;

          // Get transfer info if available
          const paymentIntent = await stripe.paymentIntents.retrieve(
            session.payment_intent
          );
          if (paymentIntent.charges?.data?.[0]?.transfer) {
            appt.payment.stripe.transferId =
              paymentIntent.charges.data[0].transfer;
          }
        }
      } catch (stripeErr) {
        console.error(
          "[MANUAL CONFIRM] Failed to retrieve Stripe session:",
          stripeErr.message
        );
      }
    }

    // Update appointment to confirmed
    appt.status = "confirmed";
    appt.payment.status = "succeeded";

    await appt.save();

    console.log("[MANUAL CONFIRM] Appointment", id, "manually confirmed");

    // Send confirmation email
    await sendConfirmationEmail({
      appointment: appt.toObject(),
      service: appt.serviceId,
      beautician: appt.beauticianId,
    });

    res.json({
      ok: true,
      message: "Payment confirmed manually",
      appointment: appt,
    });
  } catch (err) {
    console.error("Error confirming deposit:", err);
    res.status(500).json({ error: err.message || "Failed to confirm payment" });
  }
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
    // For unpaid appointments, skip refund logic entirely
    let outcome;
    let stripeRefundId;
    let newStatus;

    if (appt.status === "reserved_unpaid") {
      // Unpaid appointment - no refund needed
      outcome = {
        refundAmount: 0,
        outcomeStatus: "cancelled_no_refund",
        reasonCode: "unpaid_appointment",
      };
      newStatus = "cancelled_no_refund";
    } else {
      // Paid appointment - calculate refund
      outcome = computeCancellationOutcome({
        appointment: appt,
        policy,
        now: new Date(),
        salonTz,
      });

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
      newStatus =
        outcome.refundAmount > 0
          ? outcome.outcomeStatus
          : "cancelled_no_refund";
    }
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

// Delete all appointments for a specific beautician
r.delete("/beautician/:beauticianId", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    // Verify beautician exists
    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    // Delete all appointments for this beautician
    const result = await Appointment.deleteMany({ beauticianId });

    res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `Deleted ${result.deletedCount} appointment(s) for ${beautician.name}`,
    });
  } catch (err) {
    console.error("delete_beautician_appointments_err", err);
    res.status(400).json({
      error: err.message || "Failed to delete appointments",
    });
  }
});

// Delete a specific canceled appointment
r.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Find the appointment
    const appointment = await Appointment.findById(id);
    if (!appointment) {
      return res.status(404).json({ error: "Appointment not found" });
    }

    // Only allow deletion of canceled appointments
    if (!appointment.status.startsWith("cancelled_")) {
      return res.status(400).json({
        error: "Only canceled appointments can be deleted",
        currentStatus: appointment.status,
      });
    }

    // Delete the appointment
    await Appointment.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Canceled appointment deleted successfully",
    });
  } catch (err) {
    console.error("delete_appointment_err", err);
    res.status(400).json({
      error: err.message || "Failed to delete appointment",
    });
  }
});

export default r;
