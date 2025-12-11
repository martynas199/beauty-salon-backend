import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

async function updateAppointment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    const appointmentId = "693ae41d65afd4a1ef8073a1"; // Feb 28, 2026 appointment

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      console.log("❌ Appointment not found");
      process.exit(1);
    }

    console.log("\n📋 Current appointment:");
    console.log("Client:", appointment.client.email);
    console.log("Status:", appointment.status);
    console.log("Payment Status:", appointment.payment?.status);
    console.log("Amount Total:", appointment.payment?.amountTotal, "pence");

    // Update to paid status with correct deposit amount
    appointment.status = "confirmed";
    appointment.payment.status = "succeeded";
    appointment.payment.mode = "deposit";
    appointment.payment.amountTotal = 4375; // £43.75 in pence

    await appointment.save();

    console.log("\n✅ Appointment updated:");
    console.log("Status:", appointment.status);
    console.log("Payment Status:", appointment.payment.status);
    console.log(
      "Amount Total:",
      appointment.payment.amountTotal,
      "pence (£43.75)"
    );

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

updateAppointment();
