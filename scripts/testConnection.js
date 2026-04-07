import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

async function testConnection() {
  try {
    console.log("🔌 Testing MongoDB connection...");
    console.log(
      "📍 URI:",
      process.env.MONGO_URI?.replace(/\/\/([^:]+):([^@]+)@/, "//$1:****@"),
    ); // Hide password

    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Successfully connected to MongoDB!\n");

    // Get database info
    const dbName = mongoose.connection.db.databaseName;
    console.log(`📦 Database: ${dbName}\n`);

    // List collections
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log("📚 Available collections:");
    collections.forEach((col) => {
      console.log(`  - ${col.name}`);
    });

    // Count some key collections
    console.log("\n📊 Document counts:");
    try {
      const beauticiansCount = await mongoose.connection.db
        .collection("beauticians")
        .countDocuments();
      console.log(`  - beauticians: ${beauticiansCount}`);
    } catch (e) {
      console.log("  - beauticians: (not found)");
    }

    try {
      const servicesCount = await mongoose.connection.db
        .collection("services")
        .countDocuments();
      console.log(`  - services: ${servicesCount}`);
    } catch (e) {
      console.log("  - services: (not found)");
    }

    try {
      const locationsCount = await mongoose.connection.db
        .collection("locations")
        .countDocuments();
      console.log(`  - locations: ${locationsCount}`);
    } catch (e) {
      console.log("  - locations: (not found)");
    }

    console.log("\n✨ Connection test complete!");
    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("\n❌ Connection failed!");
    console.error("Error:", error.message);
    console.error("\nTroubleshooting steps:");
    console.error("1. Check if MongoDB is running");
    console.error("2. Verify MONGO_URI in .env file");
    console.error("3. Check network/firewall settings");
    console.error("4. For Atlas: verify IP whitelist\n");
    process.exit(1);
  }
}

testConnection();
