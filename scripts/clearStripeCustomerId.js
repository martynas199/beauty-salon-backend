import "../src/config/env.js";
import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";

const MONGO_URI = process.env.MONGO_URI;

async function clearStripeCustomerId() {
  try {
    // Get beautician ID from command line
    const beauticianId = process.argv[2];
    
    if (!beauticianId) {
      console.error("Usage: node scripts/clearStripeCustomerId.js <beauticianId>");
      console.error("Example: node scripts/clearStripeCustomerId.js 68ee0631ded002672811c07d");
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

    console.log("\n=== Current Data ===");
    console.log("Beautician:", beautician.name);
    console.log("Email:", beautician.email);
    console.log("Stripe Customer ID:", beautician.stripeCustomerId || "none");

    // Clear the customer ID
    beautician.stripeCustomerId = null;
    await beautician.save();

    console.log("\n=== ✓ Stripe Customer ID Cleared ===");
    console.log("A new customer will be created on next subscription attempt");

    process.exit(0);
  } catch (error) {
    console.error("✗ Error:", error.message);
    process.exit(1);
  }
}

clearStripeCustomerId();
