# Database Setup Guide for Multi-Location Testing

## Prerequisites

- MongoDB installed locally OR MongoDB Atlas account
- Node.js and npm installed
- Access to production database credentials (for cloning)

## Option 1: Local MongoDB Setup (Recommended for Development)

### Windows Installation

```powershell
# Using Chocolatey (recommended)
choco install mongodb

# Or download from: https://www.mongodb.com/try/download/community

# Create data directory
mkdir C:\data\db

# Start MongoDB
mongod --dbpath C:\data\db
```

### macOS Installation

```bash
# Using Homebrew
brew tap mongodb/brew
brew install mongodb-community

# Start MongoDB
brew services start mongodb-community
```

### Linux (Ubuntu/Debian) Installation

```bash
# Import MongoDB public GPG key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Create list file
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu focal/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Update and install
sudo apt-get update
sudo apt-get install -y mongodb-org

# Start service
sudo systemctl start mongod
```

### Configure Backend

Update your `.env` file in the backend directory:

```env
MONGO_URI=<MONGO_URI>
```

## Option 2: MongoDB Atlas (Cloud)

### Setup Steps

1. Go to https://www.mongodb.com/cloud/atlas/register
2. Create free M0 cluster (512MB free forever)
3. Create database user (Database Access)
4. Whitelist your IP or use 0.0.0.0/0 for development
5. Click "Connect" → "Connect your application"
6. Copy connection string

### Configure Backend

```env
MONGO_URI=<MONGO_URI>
```

## Cloning Production Database

### Export from Production

```bash
# Full database export
mongodump --uri="YOUR_PRODUCTION_MONGO_URI" --out=./backup

# Export specific collections only
mongodump --uri="YOUR_PRODUCTION_MONGO_URI" --out=./backup --collection=beauticians
mongodump --uri="YOUR_PRODUCTION_MONGO_URI" --out=./backup --collection=services
mongodump --uri="YOUR_PRODUCTION_MONGO_URI" --out=./backup --collection=appointments
```

### Import to Local Database

```bash
# Import full database
mongorestore --uri="<MONGO_URI>" ./backup

# Import specific database
mongorestore --uri="<MONGO_URI>" --db=beauty_salon_dev ./backup/production_db_name
```

### Import to MongoDB Atlas

```bash
mongorestore --uri="<MONGO_URI>" ./backup
```

## Seed Sample Locations

### Method 1: Using Seed Script

```bash
cd backend
node scripts/seedLocations.js
```

### Method 2: Manual MongoDB Shell

```bash
# Connect to MongoDB
mongosh <MONGO_URI>

# Insert locations
db.locations.insertMany([
  {
    name: "Peterborough",
    address: {
      street: "123 High Street",
      city: "Peterborough",
      postcode: "PE1 1XX",
      country: "United Kingdom"
    },
    contact: {
      phone: "+44 1733 123456",
      email: "peterborough@nobleelegance.co.uk"
    },
    description: "Our flagship location in the heart of Peterborough",
    active: true,
    order: 1,
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: "Wisbech",
    address: {
      street: "45 Market Place",
      city: "Wisbech",
      postcode: "PE13 1AB",
      country: "United Kingdom"
    },
    contact: {
      phone: "+44 1945 654321",
      email: "wisbech@nobleelegance.co.uk"
    },
    description: "Convenient location serving Wisbech and surrounding areas",
    active: true,
    order: 2,
    createdAt: new Date(),
    updatedAt: new Date()
  }
]);

# Verify
db.locations.find().pretty();
```

## Link Beauticians to Locations

### Update Existing Beauticians

```bash
# Connect to MongoDB shell
mongosh <MONGO_URI>

# Get location IDs
const peterboroughId = db.locations.findOne({name: "Peterborough"})._id;
const wisbechId = db.locations.findOne({name: "Wisbech"})._id;

# Update a beautician to work at both locations
db.beauticians.updateOne(
  { name: "Your Beautician Name" },
  { $set: { locationIds: [peterboroughId, wisbechId] } }
);

# Or update all beauticians to work at Peterborough
db.beauticians.updateMany(
  {},
  { $set: { locationIds: [peterboroughId] } }
);

# Verify
db.beauticians.find({}, {name: 1, locationIds: 1}).pretty();
```

## Testing Database Connection

### Test Script

Create `backend/scripts/testConnection.js`:

```javascript
import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";

async function testConnection() {
  try {
    console.log("Connecting to:", process.env.MONGO_URI);
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ Successfully connected to MongoDB!");

    // Test query
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    console.log("\n📦 Available collections:");
    collections.forEach((col) => console.log(`  - ${col.name}`));

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("❌ Connection failed:", error.message);
    process.exit(1);
  }
}

testConnection();
```

Run it:

```bash
node scripts/testConnection.js
```

## Troubleshooting

### Connection Refused

```bash
# Check if MongoDB is running
# Windows
net start MongoDB

# macOS
brew services list

# Linux
sudo systemctl status mongod

# If not running, start it
mongod --dbpath C:\data\db  # Windows
brew services start mongodb-community  # macOS
sudo systemctl start mongod  # Linux
```

### Authentication Failed

- Check username/password in connection string
- Ensure user has correct permissions
- For Atlas: verify network access whitelist

### Database Not Found

- MongoDB creates databases on first write operation
- Try inserting a document or run seed script

### Slow Import

```bash
# Use parallel import (faster)
mongorestore --uri="..." --numParallelCollections=4 ./backup

# Or skip specific collections
mongorestore --uri="..." --nsExclude="database.large_collection" ./backup
```

## Quick Start Checklist

- [ ] MongoDB installed and running
- [ ] Backend .env configured with MONGO_URI
- [ ] Connection tested successfully
- [ ] Sample locations seeded
- [ ] Beauticians linked to locations
- [ ] Backend server starts without errors
- [ ] Can access /api/locations endpoint
- [ ] Super admin can access Locations page in admin panel

## Verification Commands

```bash
# Check database exists
mongosh <MONGO_URI> --eval "db.getName()"

# Count documents
mongosh <MONGO_URI> --eval "db.locations.countDocuments()"

# View all locations
mongosh <MONGO_URI> --eval "db.locations.find().pretty()"

# Check beautician locations
mongosh <MONGO_URI> --eval "db.beauticians.find({locationIds: {$exists: true}}, {name: 1, locationIds: 1}).pretty()"
```

## Data Backup Best Practices

### Regular Backups

```bash
# Daily backup script
#!/bin/bash
DATE=$(date +%Y%m%d)
mongodump --uri="<MONGO_URI>" --out="./backups/backup_$DATE"

# Keep only last 7 days
find ./backups -name "backup_*" -mtime +7 -exec rm -rf {} \;
```

### Before Major Changes

```bash
# Always backup before:
# - Schema changes
# - Data migrations
# - Testing new features

mongodump --uri="YOUR_MONGO_URI" --out="./backup_before_locations_$(date +%Y%m%d)"
```

## Next Steps

After database setup:

1. Start backend: `npm run dev`
2. Verify locations API: http://localhost:4000/api/locations
3. Start frontend: `npm run dev`
4. Login as super admin
5. Navigate to Locations page
6. Create/edit locations
7. View locations on landing page

---

**Need Help?**

- MongoDB Docs: https://docs.mongodb.com/
- Connection String Format: https://docs.mongodb.com/manual/reference/connection-string/
- Atlas Documentation: https://docs.atlas.mongodb.com/
