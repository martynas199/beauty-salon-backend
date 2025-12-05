import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";

const appointmentId = process.argv[2];

async function deleteAppointment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const appointment = await Appointment.findById(appointmentId);

    if (!appointment) {
      console.log("❌ Appointment not found");
    } else {
      console.log("\n📋 Appointment to delete:");
      console.log(`ID: ${appointment._id}`);
      console.log(
        `Client: ${appointment.client?.name} (${appointment.client?.email})`
      );
      console.log(`Status: ${appointment.status}`);
      console.log(
        `Payment: ${appointment.payment?.mode} - ${appointment.payment?.status}`
      );

      await Appointment.findByIdAndDelete(appointmentId);
      console.log("\n✅ Appointment deleted successfully");
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

deleteAppointment();
