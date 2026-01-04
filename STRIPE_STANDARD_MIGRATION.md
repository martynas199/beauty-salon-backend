# Stripe Connect Migration: Express → Standard

## Overview

The beauty salon application has been migrated from **Stripe Connect Express** accounts to **Stripe Connect Standard** accounts, following the implementation pattern used in the booking-app.

**Migration Date:** January 4, 2026

---

## What Changed

### 1. Backend Changes

#### File: `src/routes/connect.js`

**Account Creation:**

- Changed account type from `"express"` to `"standard"`
- Added `stripeAccountType` field tracking to database
- Added logging for account type
- Updated API responses to include `accountType: "standard"`

**Dashboard Link Endpoint:**

- Standard accounts now return direct link to `https://dashboard.stripe.com`
- Users log in with their own Stripe credentials
- Removed automatic login link generation (not available for Standard)

**Status Endpoint:**

- Added `stripePayoutsEnabled` field tracking
- Added `accountType` to response payload

#### File: `src/models/Beautician.js`

**New Fields:**

```javascript
stripeAccountType: {
  type: String,
  enum: ["standard"],
  default: "standard",
}
stripePayoutsEnabled: { type: Boolean, default: false }
```

**Updated Status Enum:**

```javascript
stripeStatus: {
  type: String,
  enum: ["not_connected", "pending", "connected", "rejected", "disconnected"],
  default: "not_connected",
}
```

### 2. Documentation Updates

#### Files Updated:

- `STRIPE_CONNECT_GUIDE.md` - Updated all references from Express to Standard
- `STRIPE_CONNECT_COMPLETE.md` - Updated model schema documentation

**Key Changes:**

- All "Express account" references changed to "Standard account"
- Dashboard link behavior documented
- Added "Key Differences" section explaining Standard vs Express

### 3. Frontend Changes

**No Changes Required:**

- Frontend components remain compatible
- API responses include backward-compatible fields
- Settings page already handles Stripe status correctly

---

## Key Differences: Standard vs Express Accounts

### Standard Accounts (New Implementation)

**✅ Benefits:**

- **Zero monthly fees** - No Stripe subscription costs
- **Full account control** - Beauticians own their Stripe account
- **Direct dashboard access** - Log in at https://dashboard.stripe.com
- **Platform independence** - Can use account outside the platform
- **Complete transparency** - Full visibility into transactions

**⚠️ Considerations:**

- Beauticians manage their own account settings
- Platform cannot generate embedded dashboard links
- More autonomy for users (less platform control)

### Express Accounts (Previous Implementation)

**Features:**

- Simplified onboarding
- Platform-embedded dashboard
- Automatic login links
- More platform control

**Drawbacks:**

- Monthly fees apply after certain thresholds
- Limited account access
- Tied to platform

---

## Migration Impact

### For Existing Accounts

**No immediate action required:**

- Existing connected accounts continue to work
- New onboarding uses Standard accounts
- Mixed environment (Express + Standard) is supported

**To migrate existing accounts:**

1. User disconnects current Express account
2. User reconnects with new Standard account
3. System creates Standard account automatically

### For New Accounts

All new beautician accounts will be created as Standard accounts automatically.

---

## API Response Changes

### Before (Express):

```json
{
  "success": true,
  "url": "https://connect.stripe.com/setup/...",
  "stripeAccountId": "acct_..."
}
```

### After (Standard):

```json
{
  "success": true,
  "url": "https://connect.stripe.com/setup/...",
  "stripeAccountId": "acct_...",
  "accountType": "standard"
}
```

### Dashboard Link - Before (Express):

```json
{
  "success": true,
  "url": "https://connect.stripe.com/express/acct_xxxxx/..."
}
```

### Dashboard Link - After (Standard):

```json
{
  "success": true,
  "url": "https://dashboard.stripe.com",
  "accountType": "standard",
  "message": "Please log in with your Stripe account credentials"
}
```

---

## Testing Checklist

- [x] New account creation uses Standard type
- [x] Onboarding flow redirects correctly
- [x] Status endpoint returns correct account type
- [x] Dashboard link returns Stripe dashboard URL
- [x] Payment processing works with Standard accounts
- [x] Platform fees calculated correctly
- [x] Documentation updated

### Manual Testing Steps

1. **Create New Beautician Account:**

   - Log into admin panel
   - Create new beautician
   - Verify `stripeAccountType: "standard"` in database

2. **Test Onboarding:**

   - Link admin to beautician
   - Click "Connect with Stripe"
   - Complete Stripe onboarding
   - Verify status changes to "connected"
   - Check `stripePayoutsEnabled` field

3. **Test Dashboard Access:**

   - Click "View Stripe Dashboard"
   - Verify redirect to https://dashboard.stripe.com
   - Log in with Stripe credentials

4. **Test Payment Processing:**
   - Create booking with connected beautician
   - Complete payment
   - Verify platform fee (£0.50) is applied
   - Check beautician receives correct amount

---

## Rollback Plan

If issues arise, rollback by:

1. Revert `src/routes/connect.js`:

   ```javascript
   type: "express"; // Change back from "standard"
   ```

2. Revert `src/models/Beautician.js`:

   - Remove `stripeAccountType` field
   - Remove "disconnected" from status enum

3. Revert documentation files

**Note:** Existing Standard accounts will continue to work even after rollback.

---

## Support Resources

### Stripe Documentation

- [Standard Accounts Overview](https://stripe.com/docs/connect/standard-accounts)
- [Connect Account Types Comparison](https://stripe.com/docs/connect/accounts)

### Platform Documentation

- See `STRIPE_CONNECT_GUIDE.md` for complete implementation guide
- See `STRIPE_CONNECT_COMPLETE.md` for feature list

---

## Questions?

For implementation questions or issues:

- Check Stripe Dashboard logs
- Review webhook events
- Check beautician `stripeStatus` field
- Test in Stripe test mode first
