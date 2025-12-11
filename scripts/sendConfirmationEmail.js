import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";
import { sendConfirmationEmail } from "../src/emails/mailer.js";

dotenv.config();

async function sendConfirmation() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    const appointmentId = "693ae41d65afd4a1ef8073a1";

    const appointment = await Appointment.findById(appointmentId)
      .populate("serviceId")
      .populate("beauticianId");

    if (!appointment) {
      console.log("❌ Appointment not found");
      process.exit(1);
    }

    console.log("\n📋 Appointment details:");
    console.log("Client:", appointment.client.name);
    console.log("Email:", appointment.client.email);
    console.log("Service:", appointment.serviceId?.name);
    console.log("Beautician:", appointment.beauticianId?.name);
    console.log("Date:", new Date(appointment.start).toLocaleString("en-GB"));
    console.log("Status:", appointment.status);
    console.log("Payment:", appointment.payment?.status);

    console.log("\n📧 Sending confirmation email...");

    await sendConfirmationEmail({
      appointment: appointment.toObject(),
      service: appointment.serviceId,
      beautician: appointment.beauticianId,
    });

    console.log("✅ Confirmation email sent successfully!");

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    console.error(error);
    process.exit(1);
  }
}

sendConfirmation();
