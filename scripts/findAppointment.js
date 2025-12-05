import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";

const appointmentId = process.argv[2];

async function findAppointment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to MongoDB");

    const appointment = await Appointment.findById(appointmentId)
      .populate("serviceId")
      .populate("beauticianId")
      .lean();

    if (!appointment) {
      console.log("❌ Appointment not found");
    } else {
      console.log("\n📋 Appointment Details:");
      console.log(JSON.stringify(appointment, null, 2));
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

findAppointment();
