import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Location from "../src/models/Location.js";

async function seedLocations() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Connected to MongoDB\n");

    // Clear existing locations (optional - comment out if you want to keep existing)
    // await Location.deleteMany({});
    // console.log("🗑️  Cleared existing locations\n");

    const locations = [
      {
        name: "Peterborough",
        address: {
          street: "123 High Street",
          city: "Peterborough",
          postcode: "PE1 1XX",
          country: "United Kingdom",
        },
        contact: {
          phone: "+44 1733 123456",
          email: "peterborough@nobleelegance.co.uk",
        },
        description:
          "Our flagship location in the heart of Peterborough city centre",
        active: true,
        order: 1,
      },
      {
        name: "Wisbech",
        address: {
          street: "45 Market Place",
          city: "Wisbech",
          postcode: "PE13 1AB",
          country: "United Kingdom",
        },
        contact: {
          phone: "+44 1945 654321",
          email: "wisbech@nobleelegance.co.uk",
        },
        description:
          "Convenient location serving Wisbech and the surrounding Fenland area",
        active: true,
        order: 2,
      },
    ];

    const created = await Location.insertMany(locations);
    console.log(`✅ Created ${created.length} locations:\n`);
    created.forEach((loc) => {
      console.log(`  📍 ${loc.name} - ${loc.address.city}`);
    });

    console.log("\n✨ Seed complete!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding locations:", error);
    await mongoose.disconnect();
    process.exit(1);
  }
}

seedLocations();
