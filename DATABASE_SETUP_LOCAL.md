# Local Database Setup for Testing

This guide helps you clone the production database to a local MongoDB instance for safe testing of the multi-location features.

## Prerequisites

### 1. Install MongoDB Community Server (if not already installed)

**Download MongoDB:**

- Visit: https://www.mongodb.com/try/download/community
- Download MongoDB Community Server for Windows
- Install with default settings

**Alternative: Use MongoDB via Chocolatey (if you have it installed):**

```powershell
choco install mongodb
```

### 2. Create Data Directory

MongoDB needs a directory to store data:

```powershell
# Create data directory
New-Item -ItemType Directory -Force -Path "C:\data\db"
```

## Option 1: Quick Setup (Recommended)

### Step 1: Start Local MongoDB

Open a **new PowerShell window** (keep it running):

```powershell
# Start MongoDB server
mongod --dbpath "C:\data\db"
```

You should see output ending with:

```
[initandlisten] waiting for connections on port 27017
```

### Step 2: Clone the Database

In your **current terminal** (beauty-salon-backend directory):

```powershell
# Run the clone script
node scripts/cloneDatabase.js
```

This script will:

- ✅ Connect to production MongoDB Atlas
- ✅ Copy all collections to local MongoDB
- ✅ Show progress for each collection
- ✅ Provide summary when complete

### Step 3: Update Environment Variable

Create a new `.env.local` file for testing:

```powershell
# Copy current .env
Copy-Item .env .env.production

# Create .env.local
@"
PORT=4000
MONGO_URI="<MONGO_URI>"

# Copy rest of your .env content here (Stripe, Cloudinary, etc.)
"@ | Out-File -FilePath .env.local -Encoding utf8
```

Then copy the rest of your configuration from `.env` to `.env.local`.

### Step 4: Use Local Database

When testing locally:

```powershell
# Use local environment
Copy-Item .env.local .env

# Start backend with local DB
npm run dev
```

When deploying to production:

```powershell
# Restore production environment
Copy-Item .env.production .env
```

## Option 2: Manual Setup with mongodump/mongorestore

If you prefer MongoDB's native tools:

### Step 1: Install MongoDB Database Tools

Download from: https://www.mongodb.com/try/download/database-tools

Or with Chocolatey:

```powershell
choco install mongodb-database-tools
```

### Step 2: Dump Production Database

```powershell
mongodump --uri="<MONGO_URI>" --out="./backup"
```

### Step 3: Restore to Local MongoDB

```powershell
# Make sure local MongoDB is running first
mongorestore --db=beauty-salon-test ./backup/test
```

## Seeding Test Locations

After cloning the database, seed the location data:

```powershell
# Make sure you're using local database in .env
node scripts/seedLocations.js
```

This creates two test locations:

- **Peterborough** - The Broadway, PE1 1RP
- **Wisbech** - Market Place, PE13 1AB

## Testing the Multi-Location Features

### 1. Assign Beautician to Locations

**Option A: Via Admin UI**

1. Start both backend and frontend
2. Login as super admin
3. Navigate to Beauticians page
4. Edit a beautician
5. Select locations from the dropdown

**Option B: Via Script**

```powershell
node scripts/assignBeauticianToLocation.js
```

### 2. Set Location-Specific Hours

1. Login as beautician (or admin)
2. Go to Working Hours Calendar
3. Select location from dropdown
4. Set working hours
5. Save

### 3. Test Customer Booking Flow

1. Visit landing page
2. Click on a location tile
3. Verify beautician filtering
4. Complete booking
5. Check appointment has location data

## Verifying the Setup

### Check MongoDB is Running

```powershell
# In new PowerShell window
mongo
```

You should see MongoDB shell prompt:

```
MongoDB shell version v7.x.x
connecting to: <MONGO_URI>
>
```

### List Databases

```javascript
// In MongoDB shell
show dbs
```

Should show `beauty-salon-test` database.

### Check Collections

```javascript
// In MongoDB shell
use beauty-salon-test
show collections
```

Should list all collections including `locations`.

### Count Documents

```javascript
// In MongoDB shell
db.beauticians.countDocuments();
db.services.countDocuments();
db.locations.countDocuments();
```

## Troubleshooting

### MongoDB won't start

**Error:** "Data directory not found"

```powershell
# Create directory
New-Item -ItemType Directory -Force -Path "C:\data\db"
```

**Error:** "Address already in use"

```powershell
# Check if MongoDB is already running
Get-Process mongod

# Or check port 27017
Get-NetTCPConnection -LocalPort 27017
```

### Clone script fails

**Error:** "Cannot connect to production"

- Check your internet connection
- Verify MONGO_URI in .env is correct
- Check MongoDB Atlas whitelist includes your IP

**Error:** "Cannot connect to local MongoDB"

- Make sure `mongod` is running in another terminal
- Check local MongoDB is on port 27017

### Can't see locations in admin

- Run seed script: `node scripts/seedLocations.js`
- Check database: `db.locations.find()`
- Verify super admin permissions

## Switching Between Environments

### For Development/Testing

```powershell
# .env
MONGO_URI="<MONGO_URI>"
```

### For Production

```powershell
# .env
MONGO_URI="<MONGO_URI>"
```

## Best Practices

1. **Never commit .env files** - Keep sensitive data secure
2. **Use separate databases** - Always test on local copy
3. **Regular backups** - Clone database before major changes
4. **Document changes** - Keep track of schema modifications
5. **Test thoroughly** - Verify all features work with local DB

## MongoDB GUI Tools (Optional)

For easier database management, install one of these:

### MongoDB Compass (Official)

- Download: https://www.mongodb.com/try/download/compass
- Connect to: `<MONGO_URI>`

### Studio 3T

- Download: https://studio3t.com/download/
- Free for non-commercial use

### Robo 3T

- Download: https://robomongo.org/download
- Lightweight and free

## Next Steps

After local database is set up:

1. ✅ Seed location data
2. ✅ Assign beauticians to locations
3. ✅ Set location-specific working hours
4. ✅ Test booking flow
5. ✅ Verify slot generation
6. ✅ Check appointment creation

---

## Quick Reference Commands

```powershell
# Start MongoDB
mongod --dbpath "C:\data\db"

# Clone database
node scripts/cloneDatabase.js

# Seed locations
node scripts/seedLocations.js

# Start backend with local DB
npm run dev

# MongoDB shell
mongo

# List databases
show dbs

# Use database
use beauty-salon-test

# Show collections
show collections
```

Need help? Check the main documentation at `MULTI_LOCATION_COMPLETE.md`
