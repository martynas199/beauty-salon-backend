import { Router } from "express";
import Beautician from "../models/Beautician.js";
import Stripe from "stripe";

const r = Router();

// Get Stripe instance
function getStripe() {
  const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

// Get beautician features status
r.get("/:beauticianId", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId).lean();
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json({
      noFeeBookings: {
        enabled: beautician.subscription?.noFeeBookings?.enabled || false,
        status: beautician.subscription?.noFeeBookings?.status || "inactive",
        cancelAtPeriodEnd:
          beautician.subscription?.noFeeBookings?.cancelAtPeriodEnd || false,
        currentPeriodEnd:
          beautician.subscription?.noFeeBookings?.currentPeriodEnd || null,
      },
      smsConfirmations: {
        enabled: beautician.subscription?.smsConfirmations?.enabled || false,
        status: beautician.subscription?.smsConfirmations?.status || "inactive",
        cancelAtPeriodEnd:
          beautician.subscription?.smsConfirmations?.cancelAtPeriodEnd || false,
        currentPeriodEnd:
          beautician.subscription?.smsConfirmations?.currentPeriodEnd || null,
      },
    });
  } catch (err) {
    console.error("Error fetching features:", err);
    res.status(500).json({ error: err.message || "Failed to fetch features" });
  }
});

// Subscribe to No Fee Bookings feature
r.post("/:beauticianId/subscribe-no-fee", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    const stripe = getStripe();
    const noFeeBookings = beautician.subscription?.noFeeBookings;

    // Reactivate existing subscription that is set to cancel at period end
    if (noFeeBookings?.enabled && noFeeBookings?.stripeSubscriptionId) {
      if (noFeeBookings.cancelAtPeriodEnd) {
        await stripe.subscriptions.update(noFeeBookings.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });

        beautician.subscription.noFeeBookings.cancelAtPeriodEnd = false;
        beautician.subscription.noFeeBookings.status = "active";
        await beautician.save();

        return res.json({
          ok: true,
          reactivated: true,
          message: "Subscription reactivated successfully",
        });
      }

      return res
        .status(400)
        .json({ error: "Already subscribed to this feature" });
    }

    // Create or get Stripe customer
    let customerId = beautician.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: beautician.email,
        name: beautician.name,
        metadata: {
          beauticianId: beautician._id.toString(),
        },
      });
      customerId = customer.id;
      beautician.stripeCustomerId = customerId;
    }

    // Get or create the price ID for £9.99/month subscription
    // You should create this in Stripe dashboard and set it as an environment variable
    const priceId =
      process.env.NO_FEE_BOOKINGS_PRICE_ID || "price_no_fee_bookings";

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/admin/features?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/admin/features?canceled=true`,
      metadata: {
        beauticianId: beautician._id.toString(),
        feature: "no_fee_bookings",
      },
      subscription_data: {
        metadata: {
          beauticianId: beautician._id.toString(),
          feature: "no_fee_bookings",
        },
      },
    });

    await beautician.save();

    res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("Error creating subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to create subscription" });
  }
});

// Cancel No Fee Bookings subscription
r.post("/:beauticianId/cancel-no-fee", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    const subscriptionId =
      beautician.subscription?.noFeeBookings?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const stripe = getStripe();

    // Cancel subscription at period end
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Update beautician record
    beautician.subscription.noFeeBookings.cancelAtPeriodEnd = true;
    if (beautician.subscription.noFeeBookings.status === "inactive") {
      beautician.subscription.noFeeBookings.status = "active";
    }
    await beautician.save();

    res.json({
      ok: true,
      message:
        "Subscription will be canceled at the end of the current billing period",
    });
  } catch (err) {
    console.error("Error canceling subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to cancel subscription" });
  }
});

/**
 * POST /api/features/:beauticianId/subscribe-sms
 * Create SMS subscription checkout session
 */
r.post("/:beauticianId/subscribe-sms", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    const stripe = getStripe();
    const smsConfirmations = beautician.subscription?.smsConfirmations;

    // Reactivate existing SMS subscription that is set to cancel at period end
    if (smsConfirmations?.enabled && smsConfirmations?.stripeSubscriptionId) {
      if (smsConfirmations.cancelAtPeriodEnd) {
        await stripe.subscriptions.update(smsConfirmations.stripeSubscriptionId, {
          cancel_at_period_end: false,
        });

        beautician.subscription.smsConfirmations.cancelAtPeriodEnd = false;
        beautician.subscription.smsConfirmations.status = "active";
        await beautician.save();

        return res.json({
          ok: true,
          reactivated: true,
          message: "SMS subscription reactivated successfully",
        });
      }

      return res
        .status(400)
        .json({ error: "Already subscribed to SMS confirmations" });
    }

    // Create or get Stripe customer
    let customerId = beautician.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: beautician.email,
        name: beautician.name,
        metadata: {
          beauticianId: beautician._id.toString(),
        },
      });
      customerId = customer.id;
      beautician.stripeCustomerId = customerId;
      await beautician.save();
    }

    // Get price ID from environment variable
    const priceId = process.env.SMS_CONFIRMATIONS_PRICE_ID;
    if (!priceId) {
      return res
        .status(500)
        .json({ error: "SMS subscription price not configured" });
    }

    // Create checkout session for subscription
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      success_url: `${process.env.FRONTEND_URL}/admin/features?success=true&type=sms&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/admin/features?canceled=true`,
      metadata: {
        beauticianId: beautician._id.toString(),
        feature: "sms_confirmations",
      },
      subscription_data: {
        metadata: {
          beauticianId: beautician._id.toString(),
          feature: "sms_confirmations",
        },
      },
    });

    res.json({
      ok: true,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error("Error creating SMS subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to create SMS subscription" });
  }
});

/**
 * POST /api/features/:beauticianId/cancel-sms
 * Cancel SMS subscription (at end of period)
 */
r.post("/:beauticianId/cancel-sms", async (req, res) => {
  try {
    const { beauticianId } = req.params;

    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    const subscriptionId =
      beautician.subscription?.smsConfirmations?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res
        .status(400)
        .json({ error: "No active SMS subscription found" });
    }

    const stripe = getStripe();

    // Cancel at period end (don't cancel immediately)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    // Update beautician record
    beautician.subscription.smsConfirmations.cancelAtPeriodEnd = true;
    if (beautician.subscription.smsConfirmations.status === "inactive") {
      beautician.subscription.smsConfirmations.status = "active";
    }
    await beautician.save();

    res.json({
      ok: true,
      message:
        "SMS subscription will be canceled at the end of the billing period",
    });
  } catch (err) {
    console.error("Error canceling SMS subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to cancel SMS subscription" });
  }
});

export default r;
