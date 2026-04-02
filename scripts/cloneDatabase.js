/**
 * Database Cloning Script
 *
 * This script clones the production database to a local MongoDB instance for testing.
 * It copies all collections while preserving data structure.
 *
 * Prerequisites:
 * 1. Install MongoDB locally (https://www.mongodb.com/try/download/community)
 * 2. Start local MongoDB: mongod --dbpath "C:\data\db"
 * 3. Run this script: node scripts/cloneDatabase.js
 */

import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const PRODUCTION_URI = process.env.MONGO_URI;
const LOCAL_URI = "mongodb://127.0.0.1:27017/beauty-salon-test";

async function cloneDatabase() {
  console.log("🔄 Starting database clone process...\n");

  // Connect to production database
  console.log("📡 Connecting to production database...");
  const prodConnection = await mongoose
    .createConnection(PRODUCTION_URI)
    .asPromise();
  console.log("✅ Connected to production database\n");

  // Connect to local database
  console.log("📡 Connecting to local database...");
  const localConnection = await mongoose
    .createConnection(LOCAL_URI)
    .asPromise();
  console.log("✅ Connected to local database\n");

  try {
    // Auto-discover ALL collections from production
    console.log("🔍 Discovering collections in production database...");
    const allCollections = await prodConnection.db.listCollections().toArray();
    const collectionNames = allCollections.map((c) => c.name);
    console.log(
      `   Found ${collectionNames.length} collections:`,
      collectionNames.join(", "),
    );
    console.log("");

    for (const collectionName of collectionNames) {
      console.log(`\n📋 Processing collection: ${collectionName}`);

      // Get all documents from production
      const prodCollection = prodConnection.collection(collectionName);
      const documents = await prodCollection.find({}).toArray();
      console.log(`   Found ${documents.length} documents`);

      if (documents.length === 0) {
        console.log(`   ⚠️  No documents to copy`);
        continue;
      }

      // Drop local collection if exists (fresh start)
      const localCollection = localConnection.collection(collectionName);
      await localCollection.drop().catch(() => {
        // Collection might not exist, ignore error
      });

      // Insert documents into local database
      await localCollection.insertMany(documents);
      console.log(
        `   ✅ Copied ${documents.length} documents to local database`,
      );
    }

    console.log("\n\n🎉 Database clone completed successfully!");
    console.log(`\n📊 Summary:`);
    console.log(`   Source: ${PRODUCTION_URI.replace(/\/\/.*@/, "//*****@")}`);
    console.log(`   Destination: ${LOCAL_URI}`);
    console.log(`\n💡 Update your .env file to use local database:`);
    console.log(`   MONGO_URI="${LOCAL_URI}"\n`);
  } catch (error) {
    console.error("\n❌ Error during database clone:", error);
    throw error;
  } finally {
    await prodConnection.close();
    await localConnection.close();
    console.log("\n🔌 Database connections closed");
  }
}

// Run the clone
cloneDatabase()
  .then(() => {
    console.log("\n✅ Clone process finished successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Clone process failed:", error);
    process.exit(1);
  });
