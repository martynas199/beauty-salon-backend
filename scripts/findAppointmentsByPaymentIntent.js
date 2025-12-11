import "../src/config/env.js";
import mongoose from "mongoose";
import Appointment from "../src/models/Appointment.js";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";

const MONGO_URI = process.env.MONGO_URI;

async function findAppointmentsByPaymentIntent() {
  try {
    const paymentIntentId = process.argv[2];

    if (!paymentIntentId) {
      console.error(
        "Usage: node scripts/findAppointmentsByPaymentIntent.js <paymentIntentId>"
      );
      console.error(
        "Example: node scripts/findAppointmentsByPaymentIntent.js pi_3ScSnbAN8wTZWWpP2g6FDH5f"
      );
      process.exit(1);
    }

    console.log("Connecting to MongoDB...");
    await mongoose.connect(MONGO_URI);
    console.log("✓ Connected to MongoDB\n");

    console.log(
      `Searching for appointments with payment intent: ${paymentIntentId}\n`
    );

    // Search for appointments with this payment intent ID
    const appointments = await Appointment.find({
      "payment.stripe.paymentIntentId": paymentIntentId,
    })
      .populate("serviceId")
      .populate("beauticianId");

    if (appointments.length === 0) {
      console.log("✗ No appointments found with this payment intent ID");
      process.exit(0);
    }

    console.log(`=== Found ${appointments.length} Appointment(s) ===\n`);

    appointments.forEach((appt, index) => {
      console.log(`Appointment ${index + 1}:`);
      console.log(`  ID: ${appt._id}`);
      console.log(`  Client: ${appt.client?.name} (${appt.client?.email})`);
      console.log(`  Beautician: ${appt.beauticianId?.name}`);
      console.log(`  Service: ${appt.serviceId?.name} - ${appt.variantName}`);
      console.log(`  Date: ${new Date(appt.start).toLocaleString("en-GB")}`);
      console.log(`  Price: £${appt.price}`);
      console.log(`  Status: ${appt.status}`);
      console.log(`  Payment Mode: ${appt.payment?.mode}`);
      console.log(`  Payment Status: ${appt.payment?.status}`);
      console.log(`  Payment Intent: ${appt.payment?.stripe?.paymentIntentId}`);
      console.log(`  Session ID: ${appt.payment?.sessionId || "none"}`);
      console.log(
        `  Created: ${new Date(appt.createdAt).toLocaleString("en-GB")}`
      );
      console.log("");
    });

    process.exit(0);
  } catch (error) {
    console.error("✗ Error:", error.message);
    process.exit(1);
  }
}

findAppointmentsByPaymentIntent();
