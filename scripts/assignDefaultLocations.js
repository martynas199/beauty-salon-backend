/**
 * Migration Script: Assign Default Location to Beauticians
 *
 * This script finds all beauticians without location assignments
 * and assigns them to a default location.
 *
 * Usage:
 *   node scripts/assignDefaultLocations.js [defaultLocationId]
 *
 * If no locationId is provided, it will use the first location found.
 */

import mongoose from "mongoose";
import dotenv from "dotenv";
import Beautician from "../src/models/Beautician.js";
import Location from "../src/models/Location.js";

// Load environment variables
dotenv.config();

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/beauty-salon";

async function assignDefaultLocations(defaultLocationId = null) {
  try {
    // Connect to MongoDB
    console.log("🔌 Connecting to MongoDB...");
    await mongoose.connect(MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Find default location
    let defaultLocation;
    if (defaultLocationId) {
      defaultLocation = await Location.findById(defaultLocationId);
      if (!defaultLocation) {
        console.error(
          `❌ Error: Location with ID ${defaultLocationId} not found`,
        );
        process.exit(1);
      }
    } else {
      // Use first location as default
      defaultLocation = await Location.findOne().sort({ createdAt: 1 });
      if (!defaultLocation) {
        console.error(
          "❌ Error: No locations found in database. Please create a location first.",
        );
        process.exit(1);
      }
    }

    console.log(
      `\n📍 Using default location: "${defaultLocation.name}" (${defaultLocation._id})`,
    );

    // Find all beauticians without locations
    const beauticiansWithoutLocations = await Beautician.find({
      $or: [
        { locationIds: { $exists: false } },
        { locationIds: { $size: 0 } },
        { locationIds: null },
      ],
    });

    console.log(
      `\n🔍 Found ${beauticiansWithoutLocations.length} beautician(s) without locations\n`,
    );

    if (beauticiansWithoutLocations.length === 0) {
      console.log("✅ All beauticians already have location assignments!");
      await mongoose.connection.close();
      return;
    }

    // Show beauticians that will be updated
    console.log("Beauticians to be updated:");
    beauticiansWithoutLocations.forEach((b, index) => {
      console.log(`  ${index + 1}. ${b.name} (${b._id})`);
    });

    console.log(
      `\n⚠️  This will assign "${defaultLocation.name}" to ${beauticiansWithoutLocations.length} beautician(s).`,
    );
    console.log("Press Ctrl+C within 5 seconds to cancel...\n");

    // Wait 5 seconds before proceeding
    await new Promise((resolve) => setTimeout(resolve, 5000));

    // Update beauticians
    let updatedCount = 0;
    let failedCount = 0;

    for (const beautician of beauticiansWithoutLocations) {
      try {
        beautician.locationIds = [defaultLocation._id];
        await beautician.save();
        console.log(`✅ Updated: ${beautician.name}`);
        updatedCount++;
      } catch (error) {
        console.error(`❌ Failed to update ${beautician.name}:`, error.message);
        failedCount++;
      }
    }

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 MIGRATION SUMMARY");
    console.log("=".repeat(50));
    console.log(`✅ Successfully updated: ${updatedCount}`);
    if (failedCount > 0) {
      console.log(`❌ Failed: ${failedCount}`);
    }
    console.log(`📍 Default location: ${defaultLocation.name}`);
    console.log("=".repeat(50) + "\n");

    // Verify results
    const stillWithoutLocations = await Beautician.countDocuments({
      $or: [
        { locationIds: { $exists: false } },
        { locationIds: { $size: 0 } },
        { locationIds: null },
      ],
    });

    if (stillWithoutLocations > 0) {
      console.log(
        `⚠️  Warning: ${stillWithoutLocations} beautician(s) still without locations`,
      );
    } else {
      console.log("✅ All beauticians now have location assignments!");
    }
  } catch (error) {
    console.error("\n❌ Migration failed:", error);
    process.exit(1);
  } finally {
    // Close connection
    console.log("\n🔌 Closing database connection...");
    await mongoose.connection.close();
    console.log("✅ Connection closed\n");
  }
}

// Get defaultLocationId from command line args
const defaultLocationId = process.argv[2];

// Run migration
assignDefaultLocations(defaultLocationId);
