import Stripe from "stripe";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root
dotenv.config({ path: join(__dirname, "..", ".env") });

async function checkAccountType() {
  try {
    const accountId = process.argv[2] || 'acct_1SlwmsAQNY53mGu0';

    // Initialize Stripe
    const stripeKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET;
    if (!stripeKey) {
      throw new Error("STRIPE_SECRET_KEY or STRIPE_SECRET not configured");
    }
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });

    console.log(`\n🔍 Retrieving account: ${accountId}\n`);

    const account = await stripe.accounts.retrieve(accountId);

    console.log("=== Account Details ===");
    console.log(`Account ID: ${account.id}`);
    console.log(`Type: ${account.type}`);
    console.log(`Email: ${account.email || 'N/A'}`);
    console.log(`Country: ${account.country}`);
    console.log(`Charges Enabled: ${account.charges_enabled}`);
    console.log(`Payouts Enabled: ${account.payouts_enabled}`);
    console.log(`Details Submitted: ${account.details_submitted}`);
    console.log(`Created: ${new Date(account.created * 1000).toISOString()}`);
    
    if (account.business_profile?.name) {
      console.log(`Business Name: ${account.business_profile.name}`);
    }

    if (account.requirements?.currently_due?.length > 0) {
      console.log(`\n⚠️  Requirements Currently Due: ${account.requirements.currently_due.join(', ')}`);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

checkAccountType();
