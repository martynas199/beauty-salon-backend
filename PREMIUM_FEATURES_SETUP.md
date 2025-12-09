# Premium Features Subscription - Setup Guide

## Overview

This feature allows beauticians to subscribe to premium features like "No Fee Bookings" for £9.99/month via Stripe recurring payments.

## Backend Implementation

### 1. Database Schema

**File:** `src/models/Beautician.js`

- Added `stripeCustomerId` field to track Stripe customer
- Added `subscription.noFeeBookings` object with:
  - `enabled`: Boolean flag for feature activation
  - `stripeSubscriptionId`: Stripe subscription ID
  - `stripePriceId`: Price ID for the subscription
  - `status`: enum (inactive/active/past_due/canceled)
  - `currentPeriodStart/End`: Date fields for billing period

### 2. API Routes

**File:** `src/routes/features.js`

Three endpoints:

- `GET /api/features/:beauticianId` - Get feature status
- `POST /api/features/:beauticianId/subscribe-no-fee` - Create subscription checkout
- `POST /api/features/:beauticianId/cancel-no-fee` - Cancel subscription

### 3. Webhook Handlers

**File:** `src/routes/webhooks.js`

Added handlers for:

- `customer.subscription.created` - Activate feature
- `customer.subscription.updated` - Update feature status
- `customer.subscription.deleted` - Deactivate feature

### 4. Appointment Logic

**File:** `src/routes/appointments.js` (lines 148-189)

Updated appointment creation to check for active subscription:

- If beautician has `subscription.noFeeBookings.enabled === true` and `status === 'active'`
- Skip booking fee payment requirement
- Set appointment status to "confirmed" automatically

### 5. Server Configuration

**File:** `src/server.js`

- Mounted features router: `app.use("/api/features", featuresRouter)`

## Frontend Implementation

### 1. Features Page

**File:** `src/admin/pages/Features.jsx`

Premium Features management page with:

- Feature card showing subscription status
- Benefits list
- Subscribe/Cancel buttons
- Billing period display
- Pricing information (£9.99/month)

### 2. Success/Cancel Pages

**Files:**

- `src/admin/pages/FeatureSubscriptionSuccess.jsx`
- `src/admin/pages/FeatureSubscriptionCancel.jsx`

Callback pages for Stripe Checkout redirect

### 3. Navigation

**Files:**

- `src/admin/AdminLayout.jsx` - Added "Premium Features" menu item
- `src/app/routes.jsx` - Added routes for features pages

## Stripe Setup Instructions

### Step 1: Create Product

1. Go to Stripe Dashboard → Products
2. Click "Add product"
3. Enter details:
   - Name: `No Fee Bookings`
   - Description: `Premium feature that removes the £1.00 booking fee for clients`
   - Pricing model: `Recurring`
   - Price: `9.99 GBP`
   - Billing period: `Monthly`
4. Save the product

### Step 2: Get Price ID

1. After creating the product, click on it
2. Copy the Price ID (looks like `price_xxxxxxxxxxxxx`)

### Step 3: Add Environment Variable

Add to your `.env` file:

```
NO_FEE_BOOKINGS_PRICE_ID=price_xxxxxxxxxxxxx
```

### Step 4: Configure Webhooks

Ensure your Stripe webhooks are listening for:

- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `checkout.session.completed` (already configured)

For local testing:

```bash
stripe listen --forward-to localhost:4000/api/webhooks/stripe
```

For production, add your webhook endpoint in Stripe Dashboard:

```
https://your-domain.com/api/webhooks/stripe
```

## Testing Flow

### 1. Subscribe to Feature

1. Login as beautician admin
2. Navigate to Admin → Premium Features
3. Click "Subscribe Now"
4. Complete Stripe Checkout with test card: `4242 4242 4242 4242`
5. You'll be redirected to success page
6. Feature status should show "Active Subscription"

### 2. Test No Fee Booking

1. As a customer, select the beautician who subscribed
2. Choose a service and time slot
3. When payment mode is "booking_fee", no payment should be required
4. Appointment should be created with status "confirmed" automatically

### 3. Cancel Subscription

1. Go to Premium Features page
2. Click "Cancel Subscription"
3. Confirm cancellation
4. Subscription remains active until end of billing period
5. Status shows "Subscription Cancelling" with end date

## How It Works

### Subscription Flow

1. Beautician clicks "Subscribe Now"
2. Backend creates Stripe Customer (if doesn't exist)
3. Backend creates Stripe Checkout Session with subscription
4. User redirected to Stripe Checkout
5. After payment, Stripe sends webhook `checkout.session.completed`
6. Stripe sends webhook `customer.subscription.created`
7. Backend updates beautician record with subscription details
8. Feature flag `noFeeBookings.enabled` set to `true`

### Appointment Creation Flow

When appointment is created:

1. Check beautician's `subscription.noFeeBookings`
2. If `enabled === true` AND `status === 'active'`
3. Skip booking fee requirement
4. Set appointment status to "confirmed"
5. No Stripe checkout session created

### Cancellation Flow

1. Beautician clicks "Cancel Subscription"
2. Backend calls Stripe API to cancel subscription at period end
3. Subscription remains active until `currentPeriodEnd`
4. Stripe sends webhook `customer.subscription.deleted` at end of period
5. Backend sets `enabled = false` and `status = 'canceled'`

## Environment Variables Required

Backend `.env`:

```
NO_FEE_BOOKINGS_PRICE_ID=price_xxxxxxxxxxxxx
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx (or sk_live_)
FRONTEND_URL=http://localhost:5173 (or production URL)
```

## Files Modified/Created

### Backend

- ✅ `src/models/Beautician.js` - Added subscription schema
- ✅ `src/routes/features.js` - Created features API
- ✅ `src/routes/webhooks.js` - Added subscription webhooks
- ✅ `src/routes/appointments.js` - Updated booking logic
- ✅ `src/server.js` - Mounted features router

### Frontend

- ✅ `src/admin/pages/Features.jsx` - Created features management page
- ✅ `src/admin/pages/FeatureSubscriptionSuccess.jsx` - Success callback
- ✅ `src/admin/pages/FeatureSubscriptionCancel.jsx` - Cancel callback
- ✅ `src/admin/AdminLayout.jsx` - Added menu item
- ✅ `src/app/routes.jsx` - Added routes

## API Endpoints

### Get Feature Status

```
GET /api/features/:beauticianId
Response: {
  noFeeBookings: {
    enabled: true,
    status: "active",
    currentPeriodEnd: "2025-02-15T10:00:00.000Z"
  }
}
```

### Subscribe to Feature

```
POST /api/features/:beauticianId/subscribe-no-fee
Response: {
  sessionUrl: "https://checkout.stripe.com/..."
}
```

### Cancel Subscription

```
POST /api/features/:beauticianId/cancel-no-fee
Response: {
  message: "Subscription will be cancelled at period end"
}
```

## Next Steps

1. ✅ Create Stripe product and price
2. ✅ Add `NO_FEE_BOOKINGS_PRICE_ID` to environment variables
3. ✅ Test subscription flow end-to-end
4. ✅ Test appointment creation with active subscription
5. ✅ Test subscription cancellation
6. ✅ Deploy to production with production Stripe keys

## Production Checklist

- [ ] Switch to Stripe live mode keys
- [ ] Create live product and price in Stripe
- [ ] Update `NO_FEE_BOOKINGS_PRICE_ID` with live price ID
- [ ] Configure production webhook endpoint in Stripe Dashboard
- [ ] Test subscription with real payment card
- [ ] Verify webhook events are being received
- [ ] Test appointment creation with subscription active
- [ ] Test subscription cancellation

## Support

If beauticians experience issues:

1. Check subscription status in Stripe Dashboard
2. Verify webhook events were received
3. Check beautician record in MongoDB for subscription fields
4. Check server logs for webhook processing
5. Verify `NO_FEE_BOOKINGS_PRICE_ID` environment variable is set

## Revenue Impact

- Each subscription generates £9.99/month recurring revenue
- Beauticians save their clients from £1.00 per booking
- Break-even point: 10 bookings per month per beautician
- Additional value: Improved client experience and conversion rates
