import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";
import Appointment from "../src/models/Appointment.js";

const MONGO_URI = process.env.MONGO_URI;

async function findSimona() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("Connected to database\n");

    // Find Simona
    const simona = await Beautician.findOne({ 
      name: { $regex: /simona/i } 
    });

    if (!simona) {
      console.log("❌ Simona not found in database");
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log("👤 BEAUTICIAN FOUND:");
    console.log(`   Name: ${simona.name}`);
    console.log(`   ID: ${simona._id}`);
    console.log(`   Email: ${simona.email || 'N/A'}`);
    console.log(`   Phone: ${simona.phone || 'N/A'}`);
    console.log(`   Active: ${simona.active}`);
    console.log(`   Specialties: ${simona.specialties?.join(', ') || 'N/A'}`);

    // Find services assigned to Simona
    const services = await Service.find({
      $or: [
        { primaryBeauticianId: simona._id },
        { additionalBeauticianIds: simona._id },
        { beauticianId: simona._id } // Legacy field
      ]
    });

    console.log(`\n📋 SERVICES (${services.length} found):`);
    if (services.length > 0) {
      services.forEach((service, index) => {
        console.log(`\n   ${index + 1}. ${service.name}`);
        console.log(`      ID: ${service._id}`);
        console.log(`      Category: ${service.category}`);
        console.log(`      Active: ${service.active}`);
        console.log(`      Variants: ${service.variants?.length || 0}`);
        if (service.variants && service.variants.length > 0) {
          service.variants.forEach(v => {
            console.log(`        - ${v.name}: €${v.price}, ${v.durationMin}min`);
          });
        }
      });
    } else {
      console.log("   No services found");
    }

    // Check for appointments
    const appointments = await Appointment.find({ 
      beauticianId: simona._id 
    });
    
    console.log(`\n📅 APPOINTMENTS: ${appointments.length} found`);
    if (appointments.length > 0) {
      const upcoming = appointments.filter(a => new Date(a.start) > new Date());
      const past = appointments.length - upcoming.length;
      console.log(`   Upcoming: ${upcoming.length}`);
      console.log(`   Past: ${past}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("Summary:");
    console.log(`  - Beautician: ${simona.name} (${simona._id})`);
    console.log(`  - Services: ${services.length}`);
    console.log(`  - Appointments: ${appointments.length}`);
    console.log("=".repeat(60));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

findSimona();
