/**
 * ============================================================================
 * NO FEE BOOKINGS SUBSCRIPTION FEATURE - COMPLETE IMPLEMENTATION GUIDE
 * ============================================================================
 *
 * This feature allows service providers to subscribe for £9.99/month to remove
 * the £1.00 booking fee that clients normally pay when making appointments.
 *
 * Overview:
 * - Stripe-based recurring subscription
 * - Webhook integration for real-time updates
 * - Conditional fee logic throughout booking flow
 * - Admin UI for subscription management
 */

// ============================================================================
// 1. DATABASE SCHEMA CHANGES
// ============================================================================

/**
 * Add to your Provider/specialist Mongoose Model
 */
const providerSchemaAdditions = {
  // Stripe customer ID for subscriptions
  stripeCustomerId: { type: String, index: true },

  // Premium features subscription
  subscription: {
    noFeeBookings: {
      enabled: { type: Boolean, default: false },
      stripeSubscriptionId: String,
      stripePriceId: String,
      status: {
        type: String,
        enum: ["inactive", "active", "past_due", "canceled"],
        default: "inactive",
      },
      currentPeriodStart: Date,
      currentPeriodEnd: Date,
    },
  },
};

// ============================================================================
// 2. BACKEND API ROUTES - Features Controller
// ============================================================================

/**
 * File: routes/features.js
 * Endpoints for subscription management
 */

import { Router } from "express";
import Provider from "../models/Provider.js";
import Stripe from "stripe";

const router = Router();

// Initialize Stripe
function getStripe() {
  const key = process.env.STRIPE_SECRET || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET not configured");
  return new Stripe(key, { apiVersion: "2024-06-20" });
}

/**
 * GET /api/features/:providerId
 * Get subscription status for a provider
 */
router.get("/:providerId", async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await Provider.findById(providerId).lean();
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    res.json({
      noFeeBookings: {
        enabled: provider.subscription?.noFeeBookings?.enabled || false,
        status: provider.subscription?.noFeeBookings?.status || "inactive",
        currentPeriodEnd:
          provider.subscription?.noFeeBookings?.currentPeriodEnd || null,
      },
    });
  } catch (err) {
    console.error("Error fetching features:", err);
    res.status(500).json({ error: err.message || "Failed to fetch features" });
  }
});

/**
 * POST /api/features/:providerId/subscribe-no-fee
 * Create subscription checkout session
 */
router.post("/:providerId/subscribe-no-fee", async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    // Check if already subscribed
    if (provider.subscription?.noFeeBookings?.enabled) {
      return res
        .status(400)
        .json({ error: "Already subscribed to this feature" });
    }

    const stripe = getStripe();

    // Create or get Stripe customer
    let customerId = provider.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: provider.email,
        name: provider.name,
        metadata: {
          providerId: provider._id.toString(),
        },
      });
      customerId = customer.id;
      provider.stripeCustomerId = customerId;
      await provider.save();
    }

    // Get price ID from environment variable
    const priceId = process.env.NO_FEE_BOOKINGS_PRICE_ID;
    if (!priceId) {
      return res
        .status(500)
        .json({ error: "Subscription price not configured" });
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
      success_url: `${process.env.FRONTEND_URL}/admin/features?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/admin/features?canceled=true`,
      metadata: {
        providerId: provider._id.toString(),
        feature: "no_fee_bookings",
      },
      subscription_data: {
        metadata: {
          providerId: provider._id.toString(),
          feature: "no_fee_bookings",
        },
      },
    });

    res.json({ checkoutUrl: session.url });
  } catch (err) {
    console.error("Error creating subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to create subscription" });
  }
});

/**
 * POST /api/features/:providerId/cancel-no-fee
 * Cancel subscription (at period end)
 */
router.post("/:providerId/cancel-no-fee", async (req, res) => {
  try {
    const { providerId } = req.params;

    const provider = await Provider.findById(providerId);
    if (!provider) {
      return res.status(404).json({ error: "Provider not found" });
    }

    const subscriptionId =
      provider.subscription?.noFeeBookings?.stripeSubscriptionId;
    if (!subscriptionId) {
      return res.status(400).json({ error: "No active subscription found" });
    }

    const stripe = getStripe();

    // Cancel at period end (don't cancel immediately)
    await stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
    });

    res.json({
      message: "Subscription will be canceled at the end of the billing period",
    });
  } catch (err) {
    console.error("Error canceling subscription:", err);
    res
      .status(500)
      .json({ error: err.message || "Failed to cancel subscription" });
  }
});

export default router;

// ============================================================================
// 3. WEBHOOK HANDLERS - Update existing webhook file
// ============================================================================

/**
 * File: routes/webhooks.js
 * Add these event handlers to your existing webhook route
 */

const webhookHandlers = {
  /**
   * Handle successful subscription checkout
   */
  async handleCheckoutSessionCompleted(session) {
    // Check if this is a subscription checkout for no_fee_bookings
    if (
      session.mode !== "subscription" ||
      session.metadata?.feature !== "no_fee_bookings"
    ) {
      return;
    }

    const providerId = session.metadata.providerId;
    const subscriptionId = session.subscription;

    const provider = await Provider.findById(providerId);
    if (!provider) {
      console.error("[WEBHOOK] Provider not found:", providerId);
      return;
    }

    // Fetch subscription details to get price ID
    const stripe = getStripe();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update provider subscription
    provider.subscription.noFeeBookings = {
      enabled: true,
      stripeSubscriptionId: subscriptionId,
      stripePriceId: subscription.items.data[0].price.id,
      status: "active",
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
    };

    await provider.save();
    console.log("[WEBHOOK] Subscription activated for provider:", providerId);
  },

  /**
   * Handle subscription updates (renewals, cancellations, etc.)
   */
  async handleSubscriptionUpdated(subscription) {
    // Find provider by subscription ID
    const provider = await Provider.findOne({
      "subscription.noFeeBookings.stripeSubscriptionId": subscription.id,
    });

    if (!provider) {
      console.error(
        "[WEBHOOK] Provider not found for subscription:",
        subscription.id
      );
      return;
    }

    // Update subscription status
    provider.subscription.noFeeBookings.status = subscription.status;
    provider.subscription.noFeeBookings.currentPeriodStart = new Date(
      subscription.current_period_start * 1000
    );
    provider.subscription.noFeeBookings.currentPeriodEnd = new Date(
      subscription.current_period_end * 1000
    );

    // If subscription is being canceled at period end
    if (subscription.cancel_at_period_end) {
      provider.subscription.noFeeBookings.status = "canceled";
    }

    await provider.save();
    console.log("[WEBHOOK] Subscription updated for provider:", provider._id);
  },

  /**
   * Handle subscription deletion (when it actually ends)
   */
  async handleSubscriptionDeleted(subscription) {
    // Find provider by subscription ID
    const provider = await Provider.findOne({
      "subscription.noFeeBookings.stripeSubscriptionId": subscription.id,
    });

    if (!provider) {
      console.error(
        "[WEBHOOK] Provider not found for subscription:",
        subscription.id
      );
      return;
    }

    // Disable feature
    provider.subscription.noFeeBookings.enabled = false;
    provider.subscription.noFeeBookings.status = "canceled";

    await provider.save();
    console.log("[WEBHOOK] Subscription ended for provider:", provider._id);
  },
};

/**
 * In your main webhook handler, add these cases to the switch statement:
 */
const webhookRouteExample = `
router.post("/stripe", async (req, res) => {
  // ... existing signature verification code ...

  switch (event.type) {
    case "checkout.session.completed":
      await webhookHandlers.handleCheckoutSessionCompleted(event.data.object);
      break;

    case "customer.subscription.updated":
      await webhookHandlers.handleSubscriptionUpdated(event.data.object);
      break;

    case "customer.subscription.deleted":
      await webhookHandlers.handleSubscriptionDeleted(event.data.object);
      break;

    // ... other existing cases ...
  }

  res.json({ received: true });
});
`;

// ============================================================================
// 4. UPDATE APPOINTMENT CREATION LOGIC
// ============================================================================

/**
 * File: routes/appointments.js
 * Update your appointment creation endpoint
 */

const appointmentCreationUpdates = {
  /**
   * Check subscription status before creating appointment
   */
  async createAppointment(req, res) {
    const { providerId, paymentMode /* ...other fields */ } = req.body;

    // Fetch provider
    const provider = await Provider.findById(providerId);

    // Check if provider has active no-fee subscription
    const hasNoFeeSubscription =
      provider?.subscription?.noFeeBookings?.enabled === true &&
      provider?.subscription?.noFeeBookings?.status === "active";

    // Determine appointment status based on payment mode and subscription
    let status;
    let payment;

    if (paymentMode === "booking_fee") {
      if (hasNoFeeSubscription) {
        // Provider has subscription - skip booking fee
        status = "confirmed";
        payment = undefined; // No payment needed
        console.log(
          "[APPOINTMENT] Provider has no-fee subscription, skipping booking fee"
        );
      } else {
        // Normal flow - require booking fee
        status = "reserved_unpaid";
        payment = {
          mode: "booking_fee",
          provider: "stripe",
          status: "unpaid",
          amountTotal: 100, // £1.00 in pence
        };
      }
    } else if (paymentMode === "pay_in_salon") {
      status = "confirmed";
      payment = {
        mode: "pay_in_salon",
        provider: "cash",
        status: "unpaid",
        amountTotal: Math.round(servicePrice * 100),
      };
    }
    // ... handle other payment modes

    // Create appointment
    const appointment = await Appointment.create({
      client,
      providerId,
      serviceId,
      status,
      payment,
      // ... other fields
    });

    // If booking fee was skipped due to subscription, send confirmation emails immediately
    if (paymentMode === "booking_fee" && hasNoFeeSubscription) {
      await sendConfirmationEmail({
        appointment,
        service,
        provider,
      });
    }

    return res.json({ ok: true, appointmentId: appointment._id });
  },
};

/**
 * Update deposit payment logic to exclude platform fee
 */
const depositPaymentUpdates = {
  async createDepositCheckout(appointment, provider, service) {
    const depositPercent = 50; // or from request
    const depositAmount = service.price * (depositPercent / 100);

    // Check subscription
    const hasNoFeeSubscription =
      provider?.subscription?.noFeeBookings?.enabled === true &&
      provider?.subscription?.noFeeBookings?.status === "active";

    const platformFee = hasNoFeeSubscription ? 0 : 0.5; // £0.50 booking fee

    const stripe = getStripe();

    // Build line items
    const lineItems = [
      {
        price_data: {
          currency: "gbp",
          product_data: {
            name: `Deposit for ${service.name}`,
            description: `With ${provider.name}`,
          },
          unit_amount: Math.round(depositAmount * 100),
        },
        quantity: 1,
      },
    ];

    // Only add booking fee if no subscription
    if (!hasNoFeeSubscription) {
      lineItems.push({
        price_data: {
          currency: "gbp",
          product_data: {
            name: "Booking Fee",
            description: "Platform booking fee",
          },
          unit_amount: 50, // £0.50 in pence
        },
        quantity: 1,
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: lineItems,
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/booking/${appointment._id}/deposit-success`,
      cancel_url: `${process.env.FRONTEND_URL}/booking/${appointment._id}/deposit-cancel`,
      customer_email: appointment.client.email,
      metadata: {
        appointmentId: appointment._id.toString(),
        type: "manual_appointment_deposit",
        hasNoFeeSubscription: hasNoFeeSubscription.toString(),
      },
      payment_intent_data: {
        application_fee_amount: hasNoFeeSubscription ? 0 : 50, // £0.50 in pence
        transfer_data: {
          destination: provider.stripeAccountId,
        },
      },
    });

    return session;
  },
};

// ============================================================================
// 5. UPDATE EMAIL TEMPLATES
// ============================================================================

/**
 * File: emails/mailer.js
 * Update email functions to conditionally show booking fee
 */

const emailTemplateUpdates = {
  /**
   * Send confirmation email with conditional booking fee
   */
  async sendConfirmationEmail({ appointment, service, provider }) {
    // Check subscription status
    const hasNoFeeSubscription =
      provider?.subscription?.noFeeBookings?.enabled === true &&
      provider?.subscription?.noFeeBookings?.status === "active";

    const bookingFee = hasNoFeeSubscription ? 0 : 0.5;

    // In email template (text version):
    const textEmailExample = `
Dear ${appointment.client.name},

Your appointment has been confirmed!

Service: ${service.name}
Date: ${formatDate(appointment.start)}
Price: £${appointment.price}
${bookingFee > 0 ? `Booking Fee: £${bookingFee.toFixed(2)}\n` : ""}
Total: £${(appointment.price + bookingFee).toFixed(2)}

See you soon!
    `;

    // In HTML email, conditionally render the booking fee row:
    const htmlBookingFeeRow =
      bookingFee > 0
        ? `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">Booking Fee</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">£${bookingFee.toFixed(
          2
        )}</td>
      </tr>
    `
        : "";

    // Send email with nodemailer...
  },

  /**
   * Send deposit payment email with conditional fee
   */
  async sendDepositPaymentEmail({
    appointment,
    service,
    provider,
    depositAmount,
    hasNoFeeSubscription = false,
  }) {
    const platformFee = hasNoFeeSubscription ? 0 : 0.5;
    const totalAmount = depositAmount + platformFee;

    // Email template showing deposit and optional fee...
  },
};

// ============================================================================
// 6. FRONTEND - FEATURES PAGE COMPONENT
// ============================================================================

/**
 * File: admin/pages/Features.jsx
 * Complete subscription management UI
 */

const FeaturesPageComponent = `
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { selectAdmin } from "../../features/auth/authSlice";
import toast from "react-hot-toast";
import { motion } from "framer-motion";
import { api } from "../../lib/apiClient";

// Icon components
const CrownIcon = ({ className = "w-6 h-6" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 20 20">
    <path d="M10 2L12.5 7L18 8L14 12L15 18L10 15L5 18L6 12L2 8L7.5 7L10 2Z" />
  </svg>
);

const CheckIcon = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

export default function Features() {
  const navigate = useNavigate();
  const admin = useSelector(selectAdmin);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [featureStatus, setFeatureStatus] = useState(null);

  const providerId = admin?.providerId; // or specialistId, depending on your naming

  useEffect(() => {
    if (providerId) {
      fetchFeatureStatus();
    } else {
      setLoading(false);
    }
  }, [providerId]);

  const fetchFeatureStatus = async () => {
    try {
      setLoading(true);
      const statusRes = await api.get(\`/features/\${providerId}\`);
      setFeatureStatus(statusRes.data);
    } catch (error) {
      console.error("Error fetching feature status:", error);
      toast.error("Failed to load feature status");
    } finally {
      setLoading(false);
    }
  };

  const handleSubscribe = async () => {
    if (!providerId) return;
    try {
      setProcessing(true);
      const res = await api.post(\`/features/\${providerId}/subscribe-no-fee\`);
      if (res.data.checkoutUrl) {
        window.location.href = res.data.checkoutUrl;
      }
    } catch (error) {
      console.error("Error creating subscription:", error);
      toast.error(error.response?.data?.error || "Failed to start subscription");
      setProcessing(false);
    }
  };

  const handleCancel = async () => {
    if (!providerId) return;
    if (!window.confirm("Are you sure you want to cancel your subscription?")) {
      return;
    }

    try {
      setProcessing(true);
      await api.post(\`/features/\${providerId}/cancel-no-fee\`);
      toast.success("Subscription cancelled. It will remain active until the end of your billing period.");
      fetchFeatureStatus();
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      toast.error(error.response?.data?.error || "Failed to cancel subscription");
    } finally {
      setProcessing(false);
    }
  };

  if (!providerId) {
    return (
      <div className="max-w-4xl mx-auto py-4 sm:py-8 px-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 sm:p-6">
          <h2 className="text-lg sm:text-xl font-semibold text-gray-900 mb-2">
            Admin Account Not Linked
          </h2>
          <p className="text-sm sm:text-base text-gray-700 mb-4">
            Your admin account is not linked to a provider profile. Premium features are only available for provider accounts.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-4 sm:py-8 px-4">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600"></div>
          <p className="mt-2 text-sm sm:text-base text-gray-600">Loading features...</p>
        </div>
      </div>
    );
  }

  const isActive = featureStatus?.noFeeBookings?.enabled && featureStatus?.noFeeBookings?.status === "active";
  const isCanceled = featureStatus?.noFeeBookings?.status === "canceled";
  const periodEnd = featureStatus?.noFeeBookings?.currentPeriodEnd;
  const hasExpired = periodEnd && new Date(periodEnd) <= new Date();
  const isFullyCanceled = isCanceled && hasExpired;

  return (
    <div className="max-w-4xl mx-auto py-4 sm:py-8 px-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Premium Features</h1>
          <p className="text-sm sm:text-base text-gray-600">Enhance your business with premium features</p>
        </div>

        {/* No Fee Bookings Feature Card */}
        <div className="bg-white rounded-lg shadow-lg overflow-hidden border-2 border-brand-200">
          <div className="bg-brand-500 p-4 sm:p-6 text-gray-900">
            <div className="flex items-center gap-2 sm:gap-3 mb-2">
              <CrownIcon className="w-6 h-6 sm:w-8 sm:h-8" />
              <h2 className="text-xl sm:text-2xl font-bold">No Fee Bookings</h2>
            </div>
            <p className="text-sm sm:text-base text-gray-800">
              Remove the £1.00 booking fee for all your clients
            </p>
          </div>

          <div className="p-4 sm:p-6">
            {/* Status Banners */}
            {isActive && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-brand-50 border border-brand-300 rounded-lg">
                <div className="flex items-center gap-2 text-brand-900 font-semibold mb-2 text-sm sm:text-base">
                  <CheckIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>Active Subscription</span>
                </div>
                <p className="text-xs sm:text-sm text-brand-800">
                  Your clients can book without paying the £1.00 booking fee!
                </p>
                {periodEnd && (
                  <p className="text-xs sm:text-sm text-brand-700 mt-2">
                    Next billing date: {new Date(periodEnd).toLocaleDateString("en-GB")}
                  </p>
                )}
              </div>
            )}

            {isCanceled && !hasExpired && (
              <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <div className="flex items-center gap-2 text-orange-800 font-semibold mb-2">
                  <span>Subscription Canceling</span>
                </div>
                <p className="text-xs sm:text-sm text-orange-700">
                  Your subscription will end on {new Date(periodEnd).toLocaleDateString("en-GB")}
                </p>
              </div>
            )}

            {/* Benefits */}
            <div className="mb-4 sm:mb-6">
              <h3 className="font-semibold text-gray-900 mb-3 text-sm sm:text-base">Benefits Include:</h3>
              <ul className="space-y-2">
                <li className="flex items-start gap-2">
                  <CheckIcon className="text-brand-600 mt-0.5 w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-700">
                    <strong>No £1.00 booking fee</strong> for your clients
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="text-brand-600 mt-0.5 w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-700">
                    <strong>Increase bookings</strong> by removing barriers
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckIcon className="text-brand-600 mt-0.5 w-4 h-4 flex-shrink-0" />
                  <span className="text-xs sm:text-sm text-gray-700">
                    <strong>Better client experience</strong> with seamless booking
                  </span>
                </li>
              </ul>
            </div>

            {/* Pricing */}
            <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-brand-50 rounded-lg border border-brand-300">
              <div className="text-center">
                <div className="text-3xl sm:text-4xl font-bold text-gray-900 mb-1">
                  £9.99<span className="text-base sm:text-lg text-gray-600 font-normal">/month</span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600">Cancel anytime, no long-term commitment</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              {!isActive && !isCanceled && (
                <button
                  onClick={handleSubscribe}
                  disabled={processing}
                  className="w-full sm:flex-1 bg-brand-500 text-gray-900 py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-semibold hover:bg-brand-600 transition-all disabled:opacity-50"
                >
                  {processing ? "Processing..." : "Subscribe Now"}
                </button>
              )}

              {isActive && (
                <button
                  onClick={handleCancel}
                  disabled={processing}
                  className="w-full sm:flex-1 bg-gray-200 text-gray-700 py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-semibold hover:bg-gray-300 transition-all disabled:opacity-50"
                >
                  {processing ? "Processing..." : "Cancel Subscription"}
                </button>
              )}

              {isFullyCanceled && (
                <button
                  onClick={handleSubscribe}
                  disabled={processing}
                  className="w-full sm:flex-1 bg-brand-500 text-gray-900 py-2.5 sm:py-3 px-4 sm:px-6 rounded-lg text-sm sm:text-base font-semibold hover:bg-brand-600 transition-all disabled:opacity-50"
                >
                  {processing ? "Processing..." : "Resubscribe"}
                </button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
`;

// ============================================================================
// 7. FRONTEND - UPDATE CHECKOUT PAGE
// ============================================================================

/**
 * File: features/checkout/CheckoutPage.jsx
 * Show conditional booking fee to clients
 */

const checkoutPageUpdates = `
const CheckoutPage = () => {
  const [specialist, setspecialist] = useState(null);
  const booking = useSelector(selectBooking);

  useEffect(() => {
    if (booking.specialistId) {
      api.get(\`/specialists/\${booking.specialistId}\`).then(res => {
        setspecialist(res.data);
      });
    }
  }, [booking.specialistId]);

  // Check subscription status
  const hasNoFeeSubscription =
    specialist?.subscription?.noFeeBookings?.enabled === true &&
    specialist?.subscription?.noFeeBookings?.status === "active";

  const bookingFee = hasNoFeeSubscription ? 0 : 1.00;
  const totalAmount = booking.price + bookingFee;

  return (
    <div>
      {/* Service details */}
      <div className="price-breakdown">
        <div className="flex justify-between">
          <span>Service Price</span>
          <span>£{booking.price.toFixed(2)}</span>
        </div>

        <div className="flex justify-between items-center">
          <div className="text-sm text-gray-600">Booking Fee</div>
          <div className={hasNoFeeSubscription ? "text-green-600 font-semibold" : ""}>
            {hasNoFeeSubscription ? "✓ No Booking Fee" : \`£\${bookingFee.toFixed(2)}\`}
          </div>
        </div>

        <div className="flex justify-between font-bold text-lg">
          <span>Total</span>
          <span>£{totalAmount.toFixed(2)}</span>
        </div>
      </div>

      <button onClick={handleCheckout} className="checkout-button">
        Proceed to Payment
      </button>
    </div>
  );
};
`;

// ============================================================================
// 8. FRONTEND - ADMIN APPOINTMENT CREATION
// ============================================================================

/**
 * File: admin/pages/Appointments.jsx
 * Update deposit modal to show conditional fee
 */

const adminAppointmentUpdates = `
const Appointments = () => {
  const [depositModalData, setDepositModalData] = useState({
    appointmentId: null,
    price: 0,
    percent: 50,
    isCreating: false,
    hasNoFeeSubscription: false, // Add this field
  });

  const handleOpenDepositModal = async (appointment) => {
    // Fetch specialist to check subscription
    const specialist = await api.get(\`/specialists/\${appointment.specialistId}\`);
    
    const hasNoFeeSubscription =
      specialist.data?.subscription?.noFeeBookings?.enabled === true &&
      specialist.data?.subscription?.noFeeBookings?.status === "active";

    setDepositModalData({
      appointmentId: appointment._id,
      price: appointment.price,
      percent: 50,
      isCreating: false,
      hasNoFeeSubscription, // Pass to modal
    });
    setShowDepositModal(true);
  };

  return (
    <div>
      {/* Appointment list */}
      
      {/* Deposit Modal */}
      <DepositPercentModal
        show={showDepositModal}
        onClose={() => setShowDepositModal(false)}
        onConfirm={handleDepositPayment}
        depositModalData={depositModalData}
      />
    </div>
  );
};

// In DepositPercentModal component:
const DepositPercentModal = ({ depositModalData, ...props }) => {
  const { price, percent, hasNoFeeSubscription } = depositModalData;
  const depositAmount = (price * percent) / 100;
  const platformFee = hasNoFeeSubscription ? 0 : 0.50;
  const totalWithFee = depositAmount + platformFee;

  return (
    <Modal {...props}>
      <div className="deposit-summary">
        <p>Deposit Amount: £{depositAmount.toFixed(2)}</p>
        <p className="text-xs text-gray-500 mt-1">
          {hasNoFeeSubscription ? (
            <span className="text-green-600 font-semibold">
              ✓ No booking fee (subscription active)
            </span>
          ) : (
            \`+ £0.50 booking fee (total: £\${totalWithFee.toFixed(2)})\`
          )}
        </p>
      </div>
    </Modal>
  );
};
`;

// ============================================================================
// 9. STRIPE DASHBOARD SETUP STEPS
// ============================================================================

const stripeDashboardSetup = `
STRIPE DASHBOARD CONFIGURATION
================================

1. CREATE SUBSCRIPTION PRODUCT
   - Go to: https://dashboard.stripe.com/products
   - Click: "Add product"
   - Product name: "No Fee Bookings"
   - Description: "Premium feature that removes the £1.00 booking fee for clients"
   - Pricing model: "Recurring"
   - Price: £9.99
   - Billing period: "Monthly"
   - Currency: GBP
   - Click "Save product"
   - Copy the Price ID (starts with price_)

2. ADD ENVIRONMENT VARIABLE
   Add to your .env file:
   NO_FEE_BOOKINGS_PRICE_ID=price_xxxxxxxxxxxxx

3. CONFIGURE WEBHOOK ENDPOINT
   - Go to: https://dashboard.stripe.com/webhooks
   - Click "Add endpoint"
   - Endpoint URL: https://your-backend.com/api/webhooks/stripe
   - Description: "Subscription webhooks"
   - Select events to listen to:
     ✓ checkout.session.completed
     ✓ customer.subscription.created
     ✓ customer.subscription.updated
     ✓ customer.subscription.deleted
   - Click "Add endpoint"
   - Click "Reveal" next to "Signing secret"
   - Copy the webhook secret (starts with whsec_)

4. ADD WEBHOOK SECRET TO ENVIRONMENT
   Add to your .env file:
   STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

5. TEST WEBHOOK DELIVERY
   - In webhook endpoint page, click "Send test webhook"
   - Select: customer.subscription.updated
   - Check your backend logs for webhook received message
   - Verify database is updated correctly

6. IMPORTANT NOTES
   - Test mode vs Live mode have separate products and webhooks
   - Create products in BOTH test and live mode
   - Use test keys for development
   - Switch to live keys for production
   - Never commit API keys to version control
`;

// ============================================================================
// 10. ENVIRONMENT VARIABLES REQUIRED
// ============================================================================

const environmentVariables = `
# .env file - Required environment variables

# Stripe API Keys
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx  # or sk_live_ for production
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx  # or pk_live_ for production
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx  # From webhook endpoint

# Subscription Price ID
NO_FEE_BOOKINGS_PRICE_ID=price_xxxxxxxxxxxxx  # From Stripe product

# Application URLs
FRONTEND_URL=https://your-frontend.com
BACKEND_URL=https://your-backend.com

# Database
MONGO_URI=mongodb+srv://...
`;

// ============================================================================
// 11. UTILITY SCRIPTS FOR MANUAL OPERATIONS
// ============================================================================

/**
 * Script: scripts/clearTestSubscription.js
 * Clear all subscription data for a provider
 */
const clearTestSubscriptionScript = `
import "../src/config/env.js";
import mongoose from "mongoose";
import Provider from "../src/models/Provider.js";

async function clearTestSubscription() {
  const providerId = process.argv[2];
  
  if (!providerId) {
    console.error("Usage: node clearTestSubscription.js <providerId>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const provider = await Provider.findById(providerId);
  if (!provider) {
    console.error("Provider not found");
    process.exit(1);
  }

  provider.subscription.noFeeBookings = {
    enabled: false,
    stripeSubscriptionId: null,
    stripePriceId: null,
    status: "inactive",
    currentPeriodStart: null,
    currentPeriodEnd: null,
  };

  await provider.save();
  console.log("✓ Subscription data cleared");
  process.exit(0);
}

clearTestSubscription();
`;

/**
 * Script: scripts/clearStripeCustomerId.js
 * Remove invalid Stripe customer ID
 */
const clearStripeCustomerIdScript = `
import "../src/config/env.js";
import mongoose from "mongoose";
import Provider from "../src/models/Provider.js";

async function clearStripeCustomerId() {
  const providerId = process.argv[2];
  
  if (!providerId) {
    console.error("Usage: node clearStripeCustomerId.js <providerId>");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const provider = await Provider.findById(providerId);
  if (!provider) {
    console.error("Provider not found");
    process.exit(1);
  }

  console.log("Current Stripe Customer ID:", provider.stripeCustomerId);
  
  provider.stripeCustomerId = null;
  await provider.save();
  
  console.log("✓ Stripe Customer ID cleared");
  console.log("A new customer will be created on next subscription attempt");
  process.exit(0);
}

clearStripeCustomerId();
`;

/**
 * Script: scripts/listStripeAccounts.js
 * View all providers and their subscription status
 */
const listStripeAccountsScript = `
import "../src/config/env.js";
import mongoose from "mongoose";
import Provider from "../src/models/Provider.js";

async function listStripeAccounts() {
  await mongoose.connect(process.env.MONGO_URI);

  const providers = await Provider.find({}).sort({ createdAt: 1 });

  console.log("=== All Providers & Subscription Status ===\\n");

  for (const provider of providers) {
    const hasSubscription = provider.subscription?.noFeeBookings?.stripeSubscriptionId;
    
    console.log(\`\${provider.name}\`);
    console.log(\`   ID: \${provider._id}\`);
    console.log(\`   Email: \${provider.email}\`);
    
    if (hasSubscription) {
      console.log(\`   Subscription: \${provider.subscription.noFeeBookings.status}\`);
      console.log(\`   Sub ID: \${provider.subscription.noFeeBookings.stripeSubscriptionId}\`);
    } else {
      console.log(\`   Subscription: none\`);
    }
    
    console.log("");
  }

  process.exit(0);
}

listStripeAccounts();
`;

// ============================================================================
// 12. TESTING CHECKLIST
// ============================================================================

const testingChecklist = `
TESTING CHECKLIST
=================

SUBSCRIPTION FLOW
□ Subscribe button redirects to Stripe Checkout
□ Completing checkout activates subscription in database
□ Webhook updates subscription status correctly
□ Features page shows "Active" status after payment
□ Next billing date is displayed correctly

CANCELLATION FLOW
□ Cancel button shows confirmation dialog
□ Cancellation sets cancel_at_period_end in Stripe
□ Status shows "Canceling" with end date
□ After period ends, webhook sets status to "canceled"
□ Resubscribe button appears when fully canceled

APPOINTMENT CREATION WITH SUBSCRIPTION
□ Booking fee is NOT charged for clients
□ Appointment is confirmed immediately (no payment step)
□ Confirmation emails are sent automatically
□ Admin dashboard shows correct status

APPOINTMENT CREATION WITHOUT SUBSCRIPTION
□ £1.00 booking fee is charged normally
□ Payment must be completed before confirmation
□ Emails show booking fee line item

DEPOSIT PAYMENTS
□ With subscription: No £0.50 platform fee added
□ With subscription: Only deposit amount charged
□ Without subscription: Platform fee included
□ Emails show correct fee breakdown

EDGE CASES
□ Invalid Stripe customer ID (clear and recreate)
□ Immediate cancellation (period end = now)
□ Subscription in past_due status
□ Multiple providers with different states
□ Client switches between providers with/without subscription

WEBHOOK RELIABILITY
□ Webhook signature verification passes
□ All subscription events are processed correctly
□ Failed webhooks are retried by Stripe
□ Check webhook delivery logs in Stripe Dashboard
`;

// ============================================================================
// 13. COMMON ISSUES & SOLUTIONS
// ============================================================================

const troubleshooting = `
COMMON ISSUES & SOLUTIONS
=========================

ISSUE: "No such customer: cus_xxx"
SOLUTION: 
- Customer ID in database doesn't exist in Stripe
- Run: node scripts/clearStripeCustomerId.js <providerId>
- New customer will be created on next subscription

ISSUE: Webhook not receiving events
SOLUTION:
- Check webhook URL is correct in Stripe Dashboard
- Verify STRIPE_WEBHOOK_SECRET matches endpoint
- Check webhook endpoint is accessible (not localhost for production)
- Review Recent Deliveries in Stripe Dashboard for errors

ISSUE: Subscription shows "Canceling" forever
SOLUTION:
- Check if currentPeriodEnd has passed
- Frontend should check: new Date(periodEnd) <= new Date()
- If expired, show "Canceled" not "Canceling"

ISSUE: Booking fee still charged despite subscription
SOLUTION:
- Verify subscription status is "active" not just enabled
- Check hasNoFeeSubscription logic in appointment creation
- Ensure webhook has processed and updated database

ISSUE: Duplicate appointments created
SOLUTION:
- Check for duplicate webhook processing
- Ensure webhook handler is idempotent
- Use appointmentId in metadata to prevent duplicates

ISSUE: Immediate cancellation doesn't show correct status
SOLUTION:
- When canceled immediately, Stripe sets period_end to now
- Check: currentPeriodEnd <= current date
- Display "Canceled" not "Canceling" if expired
`;

// ============================================================================
// 14. IMPORTANT IMPLEMENTATION NOTES
// ============================================================================

const implementationNotes = `
CRITICAL IMPLEMENTATION NOTES
==============================

1. NEVER HARDCODE STRIPE IDS
   ✗ BAD:  const priceId = "price_xxxxx";
   ✓ GOOD: const priceId = process.env.NO_FEE_BOOKINGS_PRICE_ID;

2. ALWAYS CHECK SUBSCRIPTION STATUS
   Check both .enabled AND .status === "active"
   const hasNoFeeSubscription = 
     provider?.subscription?.noFeeBookings?.enabled === true &&
     provider?.subscription?.noFeeBookings?.status === "active";

3. WEBHOOK SECRET MUST MATCH ENDPOINT URL
   - Different endpoints need different secrets
   - Test and live mode have separate webhooks
   - Update secret if endpoint URL changes

4. TRUST WEBHOOKS AS SOURCE OF TRUTH
   - Don't rely on frontend state for subscription status
   - Always fetch from database
   - Webhooks are the authoritative source

5. HANDLE IMMEDIATE CANCELLATION
   - Check if currentPeriodEnd <= now
   - Show "Canceled" not "Canceling" if expired
   - Allow resubscribe when fully canceled

6. CUSTOMER ID MANAGEMENT
   - Store stripeCustomerId in provider model
   - Reuse customer ID for multiple subscriptions
   - Clear invalid IDs to allow recreation

7. TEST MODE VS LIVE MODE
   - Products exist separately in test and live
   - Use test keys for development
   - Never mix test and live data
   - Switch keys AND webhook secrets for production

8. SECURITY
   - Never expose secret keys in frontend
   - Always verify webhook signatures
   - Use HTTPS for webhook endpoints
   - Store sensitive data in environment variables

9. ERROR HANDLING
   - Catch and log all Stripe API errors
   - Show user-friendly error messages
   - Don't expose internal error details to users
   - Monitor webhook delivery failures

10. DATABASE TRANSACTIONS
    - Use transactions for critical updates
    - Handle race conditions
    - Ensure idempotent operations
`;

// ============================================================================
// SUMMARY
// ============================================================================

const summary = `
============================================================================
IMPLEMENTATION SUMMARY
============================================================================

This guide provides complete, production-ready code for implementing a
subscription feature that removes booking fees for clients.

KEY COMPONENTS:
1. Database schema with subscription fields
2. Backend API routes for subscription management
3. Stripe webhook handlers for real-time updates
4. Conditional appointment creation logic
5. Updated email templates
6. Frontend subscription management UI
7. Client-facing checkout updates
8. Utility scripts for manual operations

STRIPE CONFIGURATION:
- Create product in Stripe Dashboard
- Configure webhook endpoint
- Set environment variables
- Test webhook delivery

TESTING:
- Full subscription lifecycle
- Appointment creation with/without subscription
- Email template variations
- Edge cases and error handling

DEPLOYMENT:
- Update environment variables in production
- Switch to live Stripe keys
- Configure production webhook endpoint
- Monitor webhook delivery logs

For questions or issues, refer to the troubleshooting section above.
============================================================================
`;

export {
  providerSchemaAdditions,
  router as featuresRouter,
  webhookHandlers,
  appointmentCreationUpdates,
  depositPaymentUpdates,
  emailTemplateUpdates,
  FeaturesPageComponent,
  checkoutPageUpdates,
  adminAppointmentUpdates,
  stripeDashboardSetup,
  environmentVariables,
  clearTestSubscriptionScript,
  clearStripeCustomerIdScript,
  listStripeAccountsScript,
  testingChecklist,
  troubleshooting,
  implementationNotes,
  summary,
};
