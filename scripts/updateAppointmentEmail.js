import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

async function updateEmail() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    const appointmentId = "693ae41d65afd4a1ef8073a1";

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      console.log("❌ Appointment not found");
      process.exit(1);
    }

    console.log("\n📋 Current appointment:");
    console.log("Client Email:", appointment.client.email);
    console.log("Client Name:", appointment.client.name);

    // Update email
    appointment.client.email = "gintare.scerbinskiene@gmail.com";

    await appointment.save();

    console.log("\n✅ Email updated:");
    console.log("New Email:", appointment.client.email);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

updateEmail();
