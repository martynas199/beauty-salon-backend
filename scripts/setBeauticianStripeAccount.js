import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";
import "dotenv/config";

/**
 * Script to manually set Stripe Connect account ID for a beautician
 * Usage: node scripts/setBeauticianStripeAccount.js <beauticianId> <stripeAccountId>
 */

async function setStripeAccount() {
  try {
    const beauticianId = process.argv[2];
    const stripeAccountId = process.argv[3];

    if (!beauticianId || !stripeAccountId) {
      console.error(
        "❌ Usage: node scripts/setBeauticianStripeAccount.js <beauticianId> <stripeAccountId>"
      );
      console.error(
        "   Example: node scripts/setBeauticianStripeAccount.js 68ee0631ded002672811c07d acct_1SP6S8PL8sEGP84H"
      );
      process.exit(1);
    }

    // Validate Stripe account ID format
    if (!stripeAccountId.startsWith("acct_")) {
      console.error(
        "❌ Invalid Stripe account ID format. Should start with 'acct_'"
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
      `   Current stripeAccountId: ${beautician.stripeAccountId || "(not set)"}`
    );

    // Update the stripeAccountId
    beautician.stripeAccountId = stripeAccountId;
    await beautician.save();

    console.log(`\n✅ Successfully updated!`);
    console.log(`   New stripeAccountId: ${beautician.stripeAccountId}`);
    console.log(`\n✨ Beautician can now accept deposit payments!`);

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

setStripeAccount();
