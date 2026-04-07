import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Service from "../src/models/Service.js";
import Beautician from "../src/models/Beautician.js";
import Appointment from "../src/models/Appointment.js";

const MONGO_URI = process.env.MONGO_URI;

async function deleteSimona() {
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

    console.log(`Found: ${simona.name} (ID: ${simona._id})`);

    // Find services assigned to Simona
    const services = await Service.find({
      $or: [
        { primaryBeauticianId: simona._id },
        { additionalBeauticianIds: simona._id },
        { beauticianId: simona._id }
      ]
    });

    console.log(`Found ${services.length} services to delete\n`);

    // Delete services
    if (services.length > 0) {
      const serviceIds = services.map(s => s._id);
      const deleteResult = await Service.deleteMany({ _id: { $in: serviceIds } });
      console.log(`✓ Deleted ${deleteResult.deletedCount} service(s):`);
      services.forEach(s => console.log(`  - ${s.name}`));
    }

    // Delete beautician
    console.log(`\n✓ Deleting beautician: ${simona.name}...`);
    await Beautician.deleteOne({ _id: simona._id });
    console.log(`✓ Beautician deleted`);

    // Check appointments (we don't delete them, just report)
    const appointments = await Appointment.find({ 
      beauticianId: simona._id 
    });
    
    if (appointments.length > 0) {
      console.log(`\nℹ️  Note: ${appointments.length} appointment(s) still reference Simona`);
      console.log(`   (Past appointments are kept for records)`);
    }

    console.log("\n✅ DELETION COMPLETE");
    console.log("   - Simona removed from beauticians");
    console.log(`   - ${services.length} services deleted`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

deleteSimona();
