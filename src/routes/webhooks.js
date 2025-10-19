import { Router } from "express";
import Stripe from "stripe";
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
      default:
        if (
          event.type === "charge.refunded" ||
          event.type === "refund.updated"
        ) {
          // Best-effort reconciliation: mark payment status if we have appointmentId on metadata
          try {
            const obj = event.data.object;
            const apptId = obj.metadata?.appointmentId;
            if (apptId) {
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
            }
          } catch (e) {
            console.error("webhook reconcile err", e);
          }
        }
        // ignore other event types for now
        break;
    }
  } catch (e) {
    // Don't fail the webhook retry cycle for downstream errors
    console.error("Webhook handling error", e);
  }

  res.json({ received: true });
});

export default r;
