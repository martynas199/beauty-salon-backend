import mongoose from "mongoose";
import Stripe from "stripe";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import Beautician from "../src/models/Beautician.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "..", ".env") });

async function deleteStripeAccount() {
  try {
    const stripeAccountId = process.argv[2];

    if (!stripeAccountId) {
      console.error("❌ Please provide a Stripe account ID");
      console.log("Usage: node deleteStripeAccount.js <stripe-account-id>");
      console.log("Example: node deleteStripeAccount.js acct_1STnktAUMGWCq6WN");
      process.exit(1);
    }

    // Initialize Stripe
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY or STRIPE_SECRET not configured");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("MONGODB_URI or MONGO_URI not found in environment variables");
    }

    await mongoose.connect(mongoUri);
    console.log("✓ Connected to MongoDB\n");

    // Find beautician with this Stripe account
    const beautician = await Beautician.findOne({ stripeAccountId });

    if (beautician) {
      console.log("=== Found Beautician ===");
      console.log(`Name: ${beautician.name}`);
      console.log(`ID: ${beautician._id}`);
      console.log(`Stripe Account ID: ${beautician.stripeAccountId}`);
      console.log(`Stripe Status: ${beautician.stripeStatus}\n`);
    } else {
      console.log(`⚠️  No beautician found with Stripe account ID: ${stripeAccountId}`);
      console.log("Proceeding to delete from Stripe only...\n");
    }

    // Delete from Stripe
    console.log("🗑️  Deleting account from Stripe...");
    try {
      await stripe.accounts.del(stripeAccountId);
      console.log("✅ Successfully deleted Stripe account: " + stripeAccountId + "\n");
    } catch (stripeError) {
      if (stripeError.code === 'resource_missing') {
        console.log("⚠️  Account not found in Stripe (may already be deleted)\n");
      } else {
        throw stripeError;
      }
    }

    // Clear from database if beautician exists
    if (beautician) {
      console.log("🗑️  Clearing from database...");
      beautician.stripeAccountId = null;
      beautician.stripeAccountType = "standard";
      beautician.stripeStatus = "not_connected";
      beautician.stripeOnboardingCompleted = false;
      beautician.stripePayoutsEnabled = false;
      await beautician.save();
      console.log("✅ Database updated successfully\n");

      console.log("=== Updated Beautician Info ===");
      console.log(`Name: ${beautician.name}`);
      console.log(`Stripe Account ID: ${beautician.stripeAccountId || "NOT SET"}`);
      console.log(`Stripe Status: ${beautician.stripeStatus}\n`);
    }

    console.log("✅ Operation completed!");
    console.log("\nNext steps:");
    console.log("1. Beautician can now reconnect through the admin panel");
    console.log("2. New account will be created as Standard account");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    if (error.type === 'StripePermissionError') {
      console.error("\n⚠️  Permission Error: Make sure you're using the correct Stripe secret key");
    }
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

deleteStripeAccount();
