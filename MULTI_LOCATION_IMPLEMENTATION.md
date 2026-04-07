# Multi-Location Functionality Implementation Guide

## Overview

This implementation adds comprehensive multi-location support to the beauty salon booking system, allowing the business to manage multiple physical locations with location-specific working hours and booking flows.

## Implementation Status: PHASE 1 COMPLETE ✅

### ✅ Completed Features

#### 1. Backend Infrastructure

- **Location Model** (`src/models/Location.js`)
  - Full address management (street, city, postcode, country)
  - Contact information (phone, email)
  - Location images with Cloudinary integration
  - Active/inactive status
  - Display ordering
  - Coordinates for future map integration

- **Location API Routes** (`src/routes/locations.js`)
  - `GET /api/locations` - Public endpoint (active locations only)
  - `GET /api/locations?all=true` - Super admin (all locations)
  - `GET /api/locations/:id` - Get single location
  - `POST /api/locations` - Create (super admin only)
  - `PATCH /api/locations/:id` - Update (super admin only)
  - `DELETE /api/locations/:id` - Delete (super admin only)
  - `POST /api/locations/:id/upload-image` - Upload image
  - `DELETE /api/locations/:id/image` - Delete image

- **Beautician Model Updates**
  - Added `locationIds` array to link beauticians to multiple locations
  - Updated `workingHours` schema to include optional `locationId` field
  - Enables location-specific working hours

#### 2. Frontend Admin Interface

- **Locations Admin Page** (`src/admin/pages/Locations.jsx`)
  - Super admin only access
  - Full CRUD operations
  - Image upload with preview
  - Address and contact management
  - Active/inactive toggle
  - Display order configuration
  - Responsive design matching existing admin patterns

- **Navigation Integration**
  - Added "Locations" menu item in admin sidebar
  - Map pin icon added to icon library
  - Positioned under "Website Content" section

#### 3. Frontend Public Interface

- **Location Tiles Component** (`src/features/locations/LocationTiles.jsx`)
  - Beautiful card design matching hero sections style
  - Displays active locations on landing page
  - Shows location image, address, contact info
  - Click to book redirects to beautician selection with location filter
  - Smooth animations using Framer Motion
  - Responsive grid layout

- **Landing Page Integration**
  - Location tiles displayed between Hero Sections and main heading
  - Only shows when locations exist and are active
  - Maintains existing design consistency

## Files Created/Modified

### Backend Files Created:

1. `src/models/Location.js` - Location schema
2. `src/routes/locations.js` - Location API routes

### Backend Files Modified:

1. `src/models/Beautician.js` - Added locationIds and updated WorkingHoursSchema
2. `src/server.js` - Registered locations routes

### Frontend Files Created:

1. `src/features/locations/locations.api.js` - API client
2. `src/features/locations/LocationTiles.jsx` - Public tiles component
3. `src/admin/pages/Locations.jsx` - Admin management page

### Frontend Files Modified:

1. `src/app/routes.jsx` - Added locations route
2. `src/admin/AdminLayout.jsx` - Added navigation menu item and mapPin icon
3. `src/features/landing/LandingPage.jsx` - Integrated LocationTiles

## Next Steps (Phase 2 & 3)

### Phase 2: Location-Specific Working Hours

**Files to Modify:**

1. `src/admin/pages/WorkingHoursCalendar.jsx`
   - Add location selector dropdown
   - Filter working hours by location
   - Save location-specific schedules
   - Display location name in calendar view

**Implementation Steps:**

```jsx
// Add location selector before beautician selector
<select onChange={(e) => setSelectedLocationId(e.target.value)}>
  <option value="">All Locations</option>
  {locations.map((loc) => (
    <option value={loc._id}>{loc.name}</option>
  ))}
</select>;

// When saving working hours, include locationId
const newHours = weeklyDayHours.map((h) => ({
  dayOfWeek: editingDayOfWeek,
  start: h.start,
  end: h.end,
  locationId: selectedLocationId || undefined,
}));
```

### Phase 3: Location-Filtered Booking Flow

**Files to Modify:**

1. **Beautician Selection** (`src/features/beauticians/BeauticianSelectionPage.jsx`)
   - Add location filter UI
   - Filter beauticians by locationIds
   - Pass selected location to next step

2. **Time Slots** (`src/features/availability/TimeSlots.jsx`)
   - Receive location from query params or Redux
   - Filter working hours by locationId
   - Pass location to appointment creation

3. **Backend Slots** (`src/routes/slots.js`)
   - Accept locationId query parameter
   - Filter beautician working hours by location
   - Return only location-specific availability

4. **Appointments** (`src/routes/appointments.js`)
   - Add optional locationId field to appointment
   - Store location information for records

**Booking Flow Changes:**

```javascript
// Updated flow:
1. Customer selects location (optional - show all if not selected)
2. View beauticians working at that location
3. Select service
4. View only time slots for that beautician at that location
5. Book appointment with location reference
```

### Phase 4: Database Setup for Testing

#### Option 1: MongoDB Atlas (Cloud)

```bash
# 1. Create free MongoDB Atlas cluster at mongodb.com
# 2. Get connection string
# 3. Update .env
MONGO_URI=<MONGO_URI>
```

#### Option 2: Local MongoDB

```bash
# Install MongoDB locally
# Windows (using Chocolatey):
choco install mongodb

# Mac (using Homebrew):
brew install mongodb-community

# Start MongoDB
mongod --dbpath C:\data\db

# Update .env
MONGO_URI=<MONGO_URI>
```

#### Database Cloning from Production

```bash
# Export from production
mongodump --uri="production_MONGO_URI" --out=./backup

# Import to local
mongorestore --uri="<MONGO_URI>" ./backup

# Or using Atlas:
mongorestore --uri="local_MONGO_URI" ./backup
```

#### Seed Sample Locations

```javascript
// Run this script to add test locations
// backend/scripts/seedLocations.js

import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import Location from "../src/models/Location.js";

await mongoose.connect(process.env.MONGO_URI);

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
    description: "Our flagship location in the heart of Peterborough",
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
    description: "Convenient location serving Wisbech and surrounding areas",
    active: true,
    order: 2,
  },
];

await Location.insertMany(locations);
console.log("✅ Locations seeded!");
mongoose.disconnect();
```

## Testing Checklist

### Backend API Testing

- [ ] GET /api/locations returns only active locations
- [ ] GET /api/locations?all=true returns all (super admin only)
- [ ] POST /api/locations creates new location (super admin only)
- [ ] PATCH /api/locations/:id updates location
- [ ] DELETE /api/locations/:id deletes location and image
- [ ] Image upload works correctly
- [ ] Non-super admins get 403 forbidden

### Frontend Admin Testing

- [ ] Locations menu appears for super admin only
- [ ] Create location form works
- [ ] Image upload and preview works
- [ ] Edit location loads correctly
- [ ] Delete location with confirmation works
- [ ] Active/inactive toggle updates
- [ ] Form validation works

### Frontend Public Testing

- [ ] Location tiles appear on landing page
- [ ] Only active locations show
- [ ] Images display correctly
- [ ] Click navigates to booking with location filter
- [ ] Responsive design works on mobile
- [ ] No tiles shown when no locations exist

## Database Schema

### Location Collection

```javascript
{
  _id: ObjectId,
  name: String,
  address: {
    street: String,
    city: String,
    postcode: String,
    country: String
  },
  contact: {
    phone: String,
    email: String
  },
  coordinates: {
    latitude: Number,
    longitude: Number
  },
  image: {
    provider: String,
    id: String,
    url: String,
    alt: String,
    width: Number,
    height: Number
  },
  description: String,
  active: Boolean,
  order: Number,
  createdAt: Date,
  updatedAt: Date
}
```

### Beautician Updates

```javascript
{
  // Existing fields...
  locationIds: [ObjectId], // References to Location
  workingHours: [{
    dayOfWeek: Number,
    start: String,
    end: String,
    locationId: ObjectId // Optional - for location-specific hours
  }],
  // Existing fields...
}
```

## Security Considerations

- ✅ All location management endpoints require super admin authentication
- ✅ Public endpoints only return active locations
- ✅ Image uploads are validated and stored securely in Cloudinary
- ✅ Location deletion cascades to remove images from cloud storage

## Performance Optimizations

- Location list is cached on frontend (fetched once on page load)
- Public endpoint doesn't require authentication (fast response)
- Images are optimized through Cloudinary transformations
- Indexes on `active` and `order` fields for efficient queries

## Future Enhancements (Optional)

1. **Google Maps Integration**
   - Add coordinates field to locations
   - Display interactive map on location tiles
   - Directions link

2. **Location-Specific SEO**
   - Separate pages per location
   - Location-specific schema markup
   - Local business SEO optimization

3. **Location Analytics**
   - Track bookings per location
   - Popular services by location
   - Revenue by location

4. **Multi-Language Support**
   - Location descriptions in multiple languages
   - Address formatting by region

## Support & Troubleshooting

### Common Issues

**Issue:** Locations not showing on landing page

- Check if locations are marked as `active: true`
- Verify locations exist in database
- Check browser console for API errors

**Issue:** Super admin can't access Locations page

- Verify admin.role === "super_admin" in database
- Check JWT token in browser dev tools
- Clear cookies and re-login

**Issue:** Image upload fails

- Verify Cloudinary credentials in .env
- Check file size limits
- Ensure multer is installed

## Rollback Plan

If issues occur, simply:

1. Remove locations route from `server.js`
2. Comment out LocationTiles in `LandingPage.jsx`
3. Hide Locations menu item in `AdminLayout.jsx`

The system will continue to work without the locations feature.

---

**Implementation Date:** January 28, 2026
**Developer:** Senior Software Engineer
**Status:** Phase 1 Complete ✅
**Next Phase:** Working Hours Calendar Integration
