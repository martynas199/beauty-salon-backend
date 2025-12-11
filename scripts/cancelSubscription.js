import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";
import "dotenv/config";

/**
 * Script to manually cancel a beautician's subscription
 * Usage: node scripts/cancelSubscription.js <beauticianId>
 */

async function cancelSubscription() {
  try {
    const beauticianId = process.argv[2];

    if (!beauticianId) {
      console.error(
        "❌ Usage: node scripts/cancelSubscription.js <beauticianId>"
      );
      console.error(
        "   Example: node scripts/cancelSubscription.js 68ee0631ded002672811c07d"
      );
      process.exit(1);
    }

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB");

    const beautician = await Beautician.findById(beauticianId);

    if (!beautician) {
      console.error(`❌ Beautician not found with ID: ${beauticianId}`);
      process.exit(1);
    }

    console.log(`\n📋 Current beautician info:`);
    console.log(`   Name: ${beautician.name}`);
    console.log(`   Email: ${beautician.email}`);
    console.log(
      `   Subscription status: ${
        beautician.subscription?.noFeeBookings?.status || "(none)"
      }`
    );
    console.log(
      `   Subscription enabled: ${
        beautician.subscription?.noFeeBookings?.enabled || false
      }`
    );
    console.log(
      `   Current period end: ${
        beautician.subscription?.noFeeBookings?.currentPeriodEnd || "(none)"
      }`
    );

    // Cancel the subscription immediately
    if (!beautician.subscription) {
      beautician.subscription = {};
    }
    if (!beautician.subscription.noFeeBookings) {
      beautician.subscription.noFeeBookings = {};
    }

    beautician.subscription.noFeeBookings.enabled = false;
    beautician.subscription.noFeeBookings.status = "canceled";
    beautician.subscription.noFeeBookings.currentPeriodEnd = new Date(); // Set to now for immediate cancellation

    await beautician.save();

    console.log(`\n✅ Subscription cancelled successfully!`);
    console.log(
      `   New status: ${beautician.subscription.noFeeBookings.status}`
    );
    console.log(`   Enabled: ${beautician.subscription.noFeeBookings.enabled}`);
    console.log(
      `   Period end: ${beautician.subscription.noFeeBookings.currentPeriodEnd}`
    );
    console.log(`\n✨ The subscription is now fully cancelled.`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

cancelSubscription();
