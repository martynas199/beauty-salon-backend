import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

async function searchToday() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    // Find appointments created today (Dec 11, 2025)
    const today = new Date("2025-12-11");
    const tomorrow = new Date("2025-12-12");

    const appointments = await Appointment.find({
      createdAt: { $gte: today, $lt: tomorrow },
    })
      .sort({ createdAt: -1 })
      .lean();

    console.log(
      `\n📅 Found ${appointments.length} appointments created on Dec 11, 2025:\n`
    );

    for (const appt of appointments) {
      console.log("─".repeat(60));
      console.log("ID:", appt._id.toString());
      console.log("Client:", appt.client?.email);
      console.log("Start:", appt.start);
      console.log("Status:", appt.status);
      console.log("Payment Status:", appt.payment?.status);
      console.log("Payment Mode:", appt.payment?.mode);
      console.log("Checkout Session:", appt.payment?.checkoutSessionId);
      console.log("Created At:", appt.createdAt);
    }

    // Also check with the specific ID
    console.log("\n" + "=".repeat(60));
    const specific = await Appointment.findById("693acc31fde555976d30086e");
    console.log(
      "🔍 Searching for ID 693acc31fde555976d30086e:",
      specific ? "FOUND" : "NOT FOUND"
    );

    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

searchToday();
