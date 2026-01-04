import mongoose from "mongoose";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Beautician from "../src/models/Beautician.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "..", ".env") });

async function clearBeauticianStripe() {
  try {
    const beauticianId = process.argv[2];

    if (!beauticianId) {
      console.error("❌ Please provide a beautician ID");
      console.log("Usage: node clearBeauticianStripe.js <beautician-id>");
      process.exit(1);
    }

    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;

    if (!mongoUri) {
      throw new Error(
        "MONGODB_URI or MONGO_URI not found in environment variables"
      );
    }

    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB\n");

    // Find the beautician
    const beautician = await Beautician.findById(beauticianId);

    if (!beautician) {
      console.error(`❌ Beautician not found with ID: ${beauticianId}`);
      process.exit(1);
    }

    console.log("=== Current Beautician Info ===");
    console.log(`Name: ${beautician.name}`);
    console.log(`ID: ${beautician._id}`);
    console.log(`Stripe Account ID: ${beautician.stripeAccountId || "NOT SET"}`);
    console.log(`Stripe Account Type: ${beautician.stripeAccountType || "NOT SET"}`);
    console.log(`Stripe Status: ${beautician.stripeStatus || "NOT SET"}`);
    console.log(`Onboarding Completed: ${beautician.stripeOnboardingCompleted || false}`);
    console.log(`Payouts Enabled: ${beautician.stripePayoutsEnabled || false}\n`);

    // Clear Stripe fields
    beautician.stripeAccountId = null;
    beautician.stripeAccountType = "standard";
    beautician.stripeStatus = "not_connected";
    beautician.stripeOnboardingCompleted = false;
    beautician.stripePayoutsEnabled = false;
    
    await beautician.save();

    console.log("✅ Stripe account cleared successfully!\n");
    console.log("=== Updated Beautician Info ===");
    console.log(`Name: ${beautician.name}`);
    console.log(`ID: ${beautician._id}`);
    console.log(`Stripe Account ID: ${beautician.stripeAccountId || "NOT SET"}`);
    console.log(`Stripe Status: ${beautician.stripeStatus}`);
    console.log(`Onboarding Completed: ${beautician.stripeOnboardingCompleted}\n`);
    
    console.log("Next steps:");
    console.log("1. Beautician can now reconnect through the admin panel");
    console.log("2. New account will be created as Standard account");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

clearBeauticianStripe();
