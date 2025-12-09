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
        currentPeriodEnd:
          beautician.subscription?.noFeeBookings?.currentPeriodEnd || null,
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

    // Check if already subscribed
    if (beautician.subscription?.noFeeBookings?.enabled) {
      return res
        .status(400)
        .json({ error: "Already subscribed to this feature" });
    }

    const stripe = getStripe();

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
    beautician.subscription.noFeeBookings.status = "canceled";
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

export default r;
