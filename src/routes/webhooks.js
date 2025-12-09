import { Router } from "express";
import Stripe from "stripe";
import Appointment from "../models/Appointment.js";
import Beautician from "../models/Beautician.js";
import Order from "../models/Order.js";
import {
  sendConfirmationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendBeauticianProductOrderNotification,
} from "../emails/mailer.js";

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
  console.log("[WEBHOOK] ========================================");
  console.log("[WEBHOOK] Received Stripe webhook");
  console.log("[WEBHOOK] Timestamp:", new Date().toISOString());
  console.log("[WEBHOOK] ========================================");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  console.log(
    "[WEBHOOK] Webhook secret configured:",
    webhookSecret ? "YES" : "NO"
  );
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
        const orderId = session.metadata?.orderId;

        console.log(
          "[WEBHOOK] checkout.session.completed - apptId:",
          apptId,
          "orderId:",
          orderId,
          "session:",
          session.id,
          "metadata:",
          JSON.stringify(session.metadata)
        );

        // Handle appointment confirmation
        if (apptId) {
          try {
            // Check if this is a manual appointment deposit payment or booking fee
            const isManualDeposit =
              session.metadata?.type === "manual_appointment_deposit";
            const isBookingFee = session.metadata?.type === "booking_fee";

            // Retrieve payment intent to get transfer info (not needed for booking fee)
            let transferId = null;
            if (session.payment_intent && !isBookingFee) {
              try {
                const stripe = getStripe();
                const paymentIntent = await stripe.paymentIntents.retrieve(
                  session.payment_intent
                );
                if (paymentIntent.transfer_data?.destination) {
                  // For direct charges, check the latest charge
                  if (paymentIntent.charges?.data?.[0]?.transfer) {
                    transferId = paymentIntent.charges.data[0].transfer;
                  }
                }
              } catch (err) {
                console.error(
                  "[WEBHOOK] Error retrieving payment intent:",
                  err
                );
              }
            }

            const updateData = {
              $set: {
                status: "confirmed",
                "payment.status": "succeeded",
                "payment.provider": "stripe",
                "payment.mode": isManualDeposit
                  ? "deposit"
                  : isBookingFee
                  ? "booking_fee"
                  : "pay_now",
                "payment.sessionId": session.id,
                ...(isManualDeposit || isBookingFee
                  ? { "payment.checkoutSessionId": session.id }
                  : {}),
                ...(session.amount_total != null
                  ? { "payment.amountTotal": Number(session.amount_total) }
                  : {}),
                ...(session.payment_intent
                  ? { "payment.stripe.paymentIntentId": session.payment_intent }
                  : {}),
                ...(transferId
                  ? { "payment.stripe.transferId": transferId }
                  : {}),
              },
              $push: {
                audit: {
                  at: new Date(),
                  action: isManualDeposit
                    ? "webhook_deposit_paid"
                    : isBookingFee
                    ? "webhook_booking_fee_paid"
                    : "webhook_checkout_completed",
                  meta: { eventId: event.id, sessionId: session.id },
                },
              },
            };

            console.log(
              "[WEBHOOK] Updating appointment with:",
              JSON.stringify(updateData, null, 2)
            );
            console.log("[WEBHOOK] Looking for appointment ID:", apptId);

            const appointment = await Appointment.findByIdAndUpdate(
              apptId,
              updateData,
              { new: true }
            )
              .populate("serviceId")
              .populate("beauticianId");

            console.log(
              "[WEBHOOK] Found appointment:",
              appointment ? "YES" : "NO"
            );
            if (!appointment) {
              console.error("[WEBHOOK] Appointment not found with ID:", apptId);
            }

            console.log(
              "[WEBHOOK] Appointment",
              apptId,
              isManualDeposit ? "deposit paid" : "updated to confirmed",
              "- status:",
              appointment?.status,
              "payment.status:",
              appointment?.payment?.status,
              "payment.mode:",
              appointment?.payment?.mode
            );

            // Send confirmation email
            if (appointment) {
              try {
                await sendConfirmationEmail({
                  appointment,
                  service: appointment.serviceId,
                  beautician: appointment.beauticianId,
                });
                console.log(
                  "[WEBHOOK] Confirmation email sent for appointment",
                  apptId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send confirmation email:",
                  emailErr
                );
              }
            }
          } catch (e) {
            console.error("[WEBHOOK] update err", e);
          }
        }

        // Handle product order confirmation
        if (orderId) {
          try {
            const order = await Order.findByIdAndUpdate(
              orderId,
              {
                $set: {
                  paymentStatus: "paid",
                  status: "processing",
                },
              },
              { new: true }
            );

            console.log("[WEBHOOK] Order", orderId, "updated to paid");

            // Send order confirmation email to customer
            if (order) {
              try {
                await sendOrderConfirmationEmail({ order });
                console.log(
                  "[WEBHOOK] Order confirmation email sent to customer for order",
                  orderId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send order confirmation email:",
                  emailErr
                );
              }

              // Send admin notification
              try {
                await sendAdminOrderNotification({ order });
                console.log(
                  "[WEBHOOK] Admin notification sent for order",
                  orderId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send admin notification:",
                  emailErr
                );
              }

              // Send notifications to beauticians for their products
              const itemsByBeautician = {};
              for (const item of order.items) {
                const beauticianId = item.productId?.beauticianId;
                if (beauticianId) {
                  const beauticianIdStr = beauticianId.toString();
                  if (!itemsByBeautician[beauticianIdStr]) {
                    itemsByBeautician[beauticianIdStr] = [];
                  }
                  itemsByBeautician[beauticianIdStr].push(item);
                }
              }

              for (const [beauticianId, items] of Object.entries(
                itemsByBeautician
              )) {
                try {
                  const beautician = await Beautician.findById(beauticianId);
                  if (beautician?.email) {
                    await sendBeauticianProductOrderNotification({
                      order,
                      beautician,
                      beauticianItems: items,
                    });
                    console.log(
                      `[WEBHOOK] Beautician notification sent to ${beautician.email} for ${items.length} product(s) in order ${orderId}`
                    );
                  }
                } catch (beauticianEmailErr) {
                  console.error(
                    `[WEBHOOK] Failed to send beautician notification to ${beauticianId}:`,
                    beauticianEmailErr
                  );
                  // Continue with other beauticians
                }
              }
            }
          } catch (e) {
            console.error("[WEBHOOK] order update err", e);
          }
        }

        if (!apptId && !orderId) {
          console.warn(
            "[WEBHOOK] checkout.session.completed missing both apptId and orderId"
          );
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
            const appointment = await Appointment.findByIdAndUpdate(
              apptId,
              {
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
              },
              { new: true }
            )
              .populate("serviceId")
              .populate("beauticianId");

            console.log(
              "[WEBHOOK] Appointment",
              apptId,
              "updated to confirmed via PI"
            );

            // Send confirmation email
            if (appointment) {
              try {
                await sendConfirmationEmail({
                  appointment,
                  service: appointment.serviceId,
                  beautician: appointment.beauticianId,
                });
                console.log(
                  "[WEBHOOK] Confirmation email sent for appointment",
                  apptId
                );
              } catch (emailErr) {
                console.error(
                  "[WEBHOOK] Failed to send confirmation email:",
                  emailErr
                );
              }
            }
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
          orderId,
          "error:",
          pi.last_payment_error?.code,
          pi.last_payment_error?.decline_code
        );

        if (apptId) {
          try {
            const updateData = {
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
            };

            // Capture detailed payment error information
            if (pi.last_payment_error) {
              const error = pi.last_payment_error;
              updateData.$set["payment.stripe.lastPaymentError"] = {
                code: error.code,
                message: error.message,
                declineCode: error.decline_code,
                type: error.type,
              };
            }

            await Appointment.findByIdAndUpdate(apptId, updateData);
          } catch (e) {
            console.error("[WEBHOOK] payment failed update err", e);
          }
        }

        if (orderId) {
          try {
            const orderUpdateData = {
              $set: { paymentStatus: "failed" },
            };

            // Capture detailed payment error information for orders
            if (pi.last_payment_error) {
              const error = pi.last_payment_error;
              orderUpdateData.$set.lastPaymentError = {
                code: error.code,
                message: error.message,
                declineCode: error.decline_code,
                type: error.type,
              };
            }

            await Order.findByIdAndUpdate(orderId, orderUpdateData);
          } catch (e) {
            console.error("[WEBHOOK] order payment failed update err", e);
          }
        }
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object;
        const beauticianId = subscription.metadata?.beauticianId;
        const feature = subscription.metadata?.feature;

        console.log(
          "[WEBHOOK] subscription event - beauticianId:",
          beauticianId,
          "feature:",
          feature,
          "status:",
          subscription.status
        );

        if (beauticianId && feature === "no_fee_bookings") {
          try {
            const beautician = await Beautician.findById(beauticianId);
            if (beautician) {
              beautician.subscription = beautician.subscription || {};
              beautician.subscription.noFeeBookings = {
                enabled: subscription.status === "active",
                stripeSubscriptionId: subscription.id,
                stripePriceId: subscription.items.data[0]?.price.id,
                status: subscription.status,
                currentPeriodStart: new Date(
                  subscription.current_period_start * 1000
                ),
                currentPeriodEnd: new Date(
                  subscription.current_period_end * 1000
                ),
              };
              await beautician.save();
              console.log(
                "[WEBHOOK] Beautician",
                beauticianId,
                "subscription updated"
              );
            }
          } catch (e) {
            console.error("[WEBHOOK] subscription update err", e);
          }
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object;
        const beauticianId = subscription.metadata?.beauticianId;
        const feature = subscription.metadata?.feature;

        console.log(
          "[WEBHOOK] subscription deleted - beauticianId:",
          beauticianId,
          "feature:",
          feature
        );

        if (beauticianId && feature === "no_fee_bookings") {
          try {
            const beautician = await Beautician.findById(beauticianId);
            if (beautician && beautician.subscription?.noFeeBookings) {
              beautician.subscription.noFeeBookings.enabled = false;
              beautician.subscription.noFeeBookings.status = "canceled";
              await beautician.save();
              console.log(
                "[WEBHOOK] Beautician",
                beauticianId,
                "subscription canceled"
              );
            }
          } catch (e) {
            console.error("[WEBHOOK] subscription delete err", e);
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
