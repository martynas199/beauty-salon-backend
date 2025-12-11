import "../src/config/env.js";
import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";

const MONGO_URI = process.env.MONGO_URI;

async function clearTestSubscription() {
  try {
    // Get beautician ID from command line
    const beauticianId = process.argv[2];

    if (!beauticianId) {
      console.error(
        "Usage: node scripts/clearTestSubscription.js <beauticianId>"
      );
      console.error(
        "Example: node scripts/clearTestSubscription.js 68ee0631ded002672811c07d"
      );
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB");

    // Find the beautician
    const beautician = await Beautician.findById(beauticianId);
    if (!beautician) {
      console.error(`✗ Beautician not found with ID: ${beauticianId}`);
      process.exit(1);
    }

    console.log("\n=== Current Subscription Data ===");
    console.log("Beautician:", beautician.name);
    console.log("Email:", beautician.email);
    console.log(
      "Subscription Status:",
      beautician.subscription?.noFeeBookings?.status || "none"
    );
    console.log(
      "Stripe Subscription ID:",
      beautician.subscription?.noFeeBookings?.stripeSubscriptionId || "none"
    );
    console.log(
      "Enabled:",
      beautician.subscription?.noFeeBookings?.enabled || false
    );
    console.log(
      "Current Period End:",
      beautician.subscription?.noFeeBookings?.currentPeriodEnd || "none"
    );

    // Clear the subscription data
    beautician.subscription.noFeeBookings = {
      enabled: false,
      stripeSubscriptionId: null,
      stripePriceId: null,
      status: "inactive",
      currentPeriodStart: null,
      currentPeriodEnd: null,
    };

    await beautician.save();

    console.log("\n=== ✓ Subscription Data Cleared ===");
    console.log("All subscription fields have been reset to default values");
    console.log("The beautician can now subscribe fresh without any test data");

    process.exit(0);
  } catch (error) {
    console.error("✗ Error:", error.message);
    process.exit(1);
  }
}

clearTestSubscription();
