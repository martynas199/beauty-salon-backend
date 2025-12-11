import "../src/config/env.js";
import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";

const MONGO_URI = process.env.MONGO_URI;

async function listStripeAccounts() {
  try {
    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    // Find all beauticians with Stripe accounts
    const beauticians = await Beautician.find({}).sort({ createdAt: 1 });

    console.log("=== All Beauticians & Stripe Accounts ===\n");

    let connectedCount = 0;
    let notConnectedCount = 0;

    for (const beautician of beauticians) {
      const hasStripe = !!beautician.stripeAccountId;
      const hasSubscription =
        beautician.subscription?.noFeeBookings?.stripeSubscriptionId;

      if (hasStripe) connectedCount++;
      else notConnectedCount++;

      console.log(`${hasStripe ? "✓" : "✗"} ${beautician.name}`);
      console.log(`   ID: ${beautician._id}`);
      console.log(`   Email: ${beautician.email}`);
      console.log(`   Active: ${beautician.active}`);

      if (hasStripe) {
        console.log(`   Stripe Account: ${beautician.stripeAccountId}`);
        console.log(
          `   Stripe Status: ${beautician.stripeStatus || "unknown"}`
        );
      } else {
        console.log(`   Stripe Account: Not connected`);
      }

      if (hasSubscription) {
        console.log(
          `   Subscription: ${beautician.subscription.noFeeBookings.status} (${beautician.subscription.noFeeBookings.stripeSubscriptionId})`
        );
      } else if (
        beautician.subscription?.noFeeBookings?.status &&
        beautician.subscription?.noFeeBookings?.status !== "inactive"
      ) {
        console.log(
          `   Subscription: ${beautician.subscription.noFeeBookings.status} (no Stripe ID)`
        );
      }

      console.log("");
    }

    console.log("=== Summary ===");
    console.log(`Total Beauticians: ${beauticians.length}`);
    console.log(`With Stripe Connect: ${connectedCount}`);
    console.log(`Without Stripe Connect: ${notConnectedCount}`);

    process.exit(0);
  } catch (error) {
    console.error("✗ Error:", error.message);
    process.exit(1);
  }
}

listStripeAccounts();
