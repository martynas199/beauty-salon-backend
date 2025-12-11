import mongoose from "mongoose";
import dotenv from "dotenv";
import Appointment from "../src/models/Appointment.js";

dotenv.config();

async function insertAppointment() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✓ Connected to database");

    const appointmentData = {
      _id: new mongoose.Types.ObjectId("693acc31fde555976d30086e"),
      client: {
        name: "Gintare Scerbinskiene",
        email: "gintare.scerbinskiene@gmail.com",
        phone: "", // Not visible in logs
      },
      beauticianId: new mongoose.Types.ObjectId("690cfd089c0b7c48a7170dcd"),
      serviceId: new mongoose.Types.ObjectId("691c440b7293998bc9553824"),
      variantName: "Standard",
      start: new Date("2026-02-28T00:00:00.000Z"), // Adjust time if needed
      end: new Date("2026-02-28T01:00:00.000Z"), // Adjust based on service duration
      price: 42.25, // From payment amount 4425 pence = £42.25 (£41.75 deposit + £0.50 fee)
      status: "confirmed",
      payment: {
        mode: "deposit",
        provider: "stripe",
        status: "succeeded",
        sessionId:
          "cs_live_b1AH1LaT74SnHNQCcUPB21alDqMiBtmuBk08HHnNYs9Z6WO9mLVpr7J4YR",
        checkoutSessionId:
          "cs_live_b1AH1LaT74SnHNQCcUPB21alDqMiBtmuBk08HHnNYs9Z6WO9mLVpr7J4YR",
        amountTotal: 4425, // £44.25 in pence
        stripe: {
          paymentIntentId: "pi_3SdAlwAe98iGOdNI1JWFfDbW",
        },
      },
      audit: [
        {
          at: new Date("2025-12-11T14:23:14.723Z"),
          action: "webhook_deposit_paid",
          meta: {
            eventId: "evt_1SdAlyAe98iGOdNIfdzFxPQ7",
            sessionId:
              "cs_live_b1AH1LaT74SnHNQCcUPB21alDqMiBtmuBk08HHnNYs9Z6WO9mLVpr7J4YR",
          },
        },
      ],
      createdAt: new Date("2025-12-11T14:23:12.000Z"), // Before webhook
      updatedAt: new Date("2025-12-11T14:23:14.723Z"),
    };

    // Check if it already exists
    const existing = await Appointment.findById(appointmentData._id);
    if (existing) {
      console.log("❌ Appointment already exists!");
      console.log("Status:", existing.status);
      console.log("Payment Status:", existing.payment?.status);
      process.exit(0);
    }

    // Insert the appointment
    const result = await Appointment.create(appointmentData);
    console.log("✅ Appointment inserted successfully!");
    console.log("ID:", result._id.toString());
    console.log("Client:", result.client.email);
    console.log("Status:", result.status);
    console.log("Payment Status:", result.payment.status);

    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error.message);
    process.exit(1);
  }
}

insertAppointment();
