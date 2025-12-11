import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

async function checkLatest() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    // Find the most recent appointment
    const latest = await Appointment.findOne().sort({ createdAt: -1 }).lean();

    if (!latest) {
      console.log("No appointments found");
      return;
    }

    console.log("\n📅 Latest appointment:");
    console.log("ID:", latest._id.toString());
    console.log("Client:", latest.client?.email);
    console.log("Start:", latest.start);
    console.log("Status:", latest.status);
    console.log("Payment Status:", latest.payment?.status);
    console.log("Payment Mode:", latest.payment?.mode);
    console.log("Checkout Session:", latest.payment?.checkoutSessionId);
    console.log("Created At:", latest.createdAt);

    // Search for the specific ID from webhook
    const webhookAppt = await Appointment.findById("693acc31fde555976d30086e");
    console.log("\n🔍 Searching for webhook ID 693acc31fde555976d30086e:");
    console.log("Found:", !!webhookAppt);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

checkLatest();
