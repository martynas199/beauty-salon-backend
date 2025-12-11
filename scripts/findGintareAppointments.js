import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

async function findGintare() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    // Search for appointments with martynas.20@hotmail.com
    const appointments = await Appointment.find({
      "client.email": "martynas.20@hotmail.com",
    })
      .sort({ createdAt: -1 })
      .limit(5);

    console.log(`\n📅 Found ${appointments.length} appointments:\n`);

    for (const appt of appointments) {
      console.log("─".repeat(60));
      console.log("ID:", appt._id.toString());
      console.log("Client:", appt.client?.email);
      console.log("Start:", appt.start);
      console.log("Status:", appt.status);
      console.log("Payment Status:", appt.payment?.status);
      console.log("Payment Mode:", appt.payment?.mode);
      console.log("Amount Total:", appt.payment?.amountTotal, "pence");
      console.log("Session:", appt.payment?.checkoutSessionId);
      console.log("Created At:", appt.createdAt);
    }

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

findGintare();
