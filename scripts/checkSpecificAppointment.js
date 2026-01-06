import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";

const MONGO_URI = process.env.MONGO_URI;
const appointmentId = process.argv[2];

async function checkAppointment() {
  try {
    if (!appointmentId) {
      console.error("❌ Please provide an appointment ID");
      process.exit(1);
    }

    console.log(`🔍 Searching for appointment: ${appointmentId}`);
    await mongoose.connect(MONGO_URI);

    const appointment = await Appointment.findById(appointmentId)
      .populate("beauticianId", "name email")
      .populate("serviceId", "name price")
      .populate("userId", "name email")
      .lean();

    if (appointment) {
      console.log("\n✅ Appointment found:");
      console.log(JSON.stringify(appointment, null, 2));
    } else {
      console.log("\n❌ Appointment not found in database");
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    await mongoose.disconnect();
    process.exit(1);
  }
}

checkAppointment();
