import { Router } from "express";
import Stripe from "stripe";
import Appointment from "../models/Appointment.js";
import Beautician from "../models/Beautician.js";
import Order from "../models/Order.js";

const r = Router();
let stripeInstance = null;
function getStripe() {
  if (!stripeInstance) {
    const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
    if (!key) throw new Error("STRIPE_SECRET not configured");
    stripeInstance = new Stripe(key, { apiVersion: "2024-06-20" });
  }
  return stripeInstance;
}

// Note: This route expects the raw request body. Ensure server mounts it with express.raw for this path.
r.post("/stripe", async (req, res) => {
  console.log("[WEBHOOK] Received Stripe webhook");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET || !webhookSecret) {
    console.error("[WEBHOOK] Stripe not configured");
    return res.status(500).send("Stripe not configured");
  }

  const sig = req.headers["stripe-signature"];
  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    console.log("[WEBHOOK] Event verified:", event.type, "ID:", event.id);
  } catch (err) {
    console.error("[WEBHOOK] Signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const apptId =
          session.client_reference_id || session.metadata?.appointmentId;
        console.log(
          "[WEBHOOK] checkout.session.completed - apptId:",
          apptId,
          "session:",
          session.id
        );
        if (apptId) {
          try {
            await Appointment.findByIdAndUpdate(apptId, {
              $set: {
                status: "confirmed",
                "payment.status": "succeeded",
                "payment.provider": "stripe",
                "payment.mode": "pay_now",
                "payment.sessionId": session.id,
                ...(session.amount_total != null
                  ? { "payment.amountTotal": Number(session.amount_total) }
                  : {}),
              },
              $push: {
                audit: {
                  at: new Date(),
                  action: "webhook_checkout_completed",
                  meta: { eventId: event.id },
                },
              },
            });
            console.log(
              "[WEBHOOK] Appointment",
              apptId,
              "updated to confirmed"
            );
          } catch (e) {
            console.error("[WEBHOOK] update err", e);
          }
        } else {
          console.warn("[WEBHOOK] checkout.session.completed missing apptId");
        }
        break;
      }
      case "payment_intent.succeeded": {
        const pi = event.data.object;
        const apptId = pi.metadata?.appointmentId;
        console.log(
          "[WEBHOOK] payment_intent.succeeded - apptId:",
          apptId,
          "pi:",
          pi.id
        );
        if (apptId) {
          try {
            await Appointment.findByIdAndUpdate(apptId, {
              $set: {
                status: "confirmed",
                "payment.status": "succeeded",
                "payment.provider": "stripe",
                "payment.mode": "pay_now",
                "payment.stripe.paymentIntentId": pi.id,
              },
              $push: {
                audit: {
                  at: new Date(),
                  action: "webhook_pi_succeeded",
                  meta: { eventId: event.id },
                },
              },
            });
            console.log(
              "[WEBHOOK] Appointment",
              apptId,
              "updated to confirmed via PI"
            );
          } catch (e) {
            console.error("[WEBHOOK] update err", e);
          }
        }
        break;
      }
      case "charge.refunded": {
        const charge = event.data.object;
        const apptId = charge.metadata?.appointmentId;
        const orderId = charge.metadata?.orderId;

        console.log(
          "[WEBHOOK] charge.refunded - apptId:",
          apptId,
          "orderId:",
          orderId
        );

        if (apptId) {
          try {
            await Appointment.findByIdAndUpdate(apptId, {
              $set: { "payment.status": "refunded" },
              $push: {
                audit: {
                  at: new Date(),
                  action: "stripe_refund_webhook",
                  meta: { eventId: event.id },
                },
              },
            });
            console.log("[WEBHOOK] Appointment", apptId, "marked as refunded");
          } catch (e) {
            console.error("[WEBHOOK] refund update err", e);
          }
        }

        if (orderId) {
          try {
            await Order.findByIdAndUpdate(orderId, {
              $set: {
                paymentStatus: "refunded",
                refundStatus: "full",
                refundedAt: new Date(),
              },
            });
            console.log("[WEBHOOK] Order", orderId, "marked as refunded");
          } catch (e) {
            console.error("[WEBHOOK] order refund update err", e);
          }
        }
        break;
      }

      case "account.updated": {
        // Stripe Connect account status changed
        const account = event.data.object;
        console.log("[WEBHOOK] account.updated - account:", account.id);

        try {
          const beautician = await Beautician.findOne({
            stripeAccountId: account.id,
          });
          if (beautician) {
            const isComplete =
              account.details_submitted && account.charges_enabled;
            beautician.stripeStatus = isComplete ? "connected" : "pending";
            beautician.stripeOnboardingCompleted = isComplete;
            await beautician.save();
            console.log(
              "[WEBHOOK] Beautician",
              beautician._id,
              "status updated to",
              beautician.stripeStatus
            );
          }
        } catch (e) {
          console.error("[WEBHOOK] account update err", e);
        }
        break;
      }

      case "payout.paid": {
        // Payout successfully sent to beautician's bank
        const payout = event.data.object;
        console.log(
          "[WEBHOOK] payout.paid - amount:",
          payout.amount,
          "account:",
          event.account
        );

        try {
          const beautician = await Beautician.findOne({
            stripeAccountId: event.account,
          });
          if (beautician) {
            beautician.totalPayouts += payout.amount / 100; // Convert from pence to pounds
            beautician.lastPayoutDate = new Date(payout.arrival_date * 1000);
            await beautician.save();
            console.log(
              "[WEBHOOK] Beautician",
              beautician._id,
              "payout recorded"
            );
          }
        } catch (e) {
          console.error("[WEBHOOK] payout update err", e);
        }
        break;
      }

      case "payment_intent.payment_failed": {
        const pi = event.data.object;
        const apptId = pi.metadata?.appointmentId;
        const orderId = pi.metadata?.orderId;

        console.log(
          "[WEBHOOK] payment_intent.payment_failed - apptId:",
          apptId,
          "orderId:",
          orderId
        );

        if (apptId) {
          try {
            await Appointment.findByIdAndUpdate(apptId, {
              $set: { "payment.status": "unpaid", status: "reserved_unpaid" },
              $push: {
                audit: {
                  at: new Date(),
                  action: "payment_failed",
                  meta: {
                    eventId: event.id,
                    error: pi.last_payment_error?.message,
                  },
                },
              },
            });
          } catch (e) {
            console.error("[WEBHOOK] payment failed update err", e);
          }
        }

        if (orderId) {
          try {
            await Order.findByIdAndUpdate(orderId, {
              $set: { paymentStatus: "failed" },
            });
          } catch (e) {
            console.error("[WEBHOOK] order payment failed update err", e);
          }
        }
        break;
      }

      default:
        console.log("[WEBHOOK] Unhandled event type:", event.type);
        break;
    }
  } catch (e) {
    // Don't fail the webhook retry cycle for downstream errors
    console.error("Webhook handling error", e);
  }

  res.json({ received: true });
});

export default r;
