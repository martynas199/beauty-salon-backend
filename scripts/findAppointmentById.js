import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

const appointmentId = process.argv[2] || "693acc31fde555976d30086e";

async function findById() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log(
      "✓ Connected to database:",
      process.env.MONGO_URI.substring(0, 50) + "..."
    );

    const appointment = await Appointment.findById(appointmentId)
      .populate("serviceId")
      .populate("beauticianId")
      .lean();

    if (!appointment) {
      console.log(`\n❌ Appointment ${appointmentId} NOT FOUND`);

      // Search for similar IDs
      const similar = await Appointment.find({
        _id: { $regex: appointmentId.substring(0, 10) },
      })
        .limit(5)
        .lean();

      if (similar.length > 0) {
        console.log(`\n🔍 Found ${similar.length} similar IDs:`);
        similar.forEach((a) => console.log(`  - ${a._id}`));
      }
    } else {
      console.log(`\n✅ Appointment ${appointmentId} FOUND:\n`);
      console.log("Client:", appointment.client?.email);
      console.log("Beautician:", appointment.beauticianId?.name);
      console.log("Service:", appointment.serviceId?.name);
      console.log("Variant:", appointment.variantName);
      console.log("Start:", appointment.start);
      console.log("Status:", appointment.status);
      console.log("Payment Status:", appointment.payment?.status);
      console.log("Payment Mode:", appointment.payment?.mode);
      console.log("Checkout Session:", appointment.payment?.checkoutSessionId);
      console.log(
        "Payment Intent:",
        appointment.payment?.stripe?.paymentIntentId
      );
      console.log("Created At:", appointment.createdAt);
    }

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

findById();
