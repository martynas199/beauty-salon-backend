import mongoose from "mongoose";

// Legacy day schema for backward compatibility
const DaySchema = new mongoose.Schema(
  {
    start: String,
    end: String,
    breaks: [{ start: String, end: String }],
  },
  { _id: false }
);

// New working hours schema for admin system
const WorkingHoursSchema = new mongoose.Schema(
  {
    dayOfWeek: { type: Number, min: 0, max: 6 }, // 0=Sunday, 6=Saturday
    start: String, // HH:mm format
    end: String, // HH:mm format
  },
  { _id: false }
);

const BeauticianSchema = new mongoose.Schema(
  {
    name: String,
    email: String,
    phone: String,
    bio: String,
    specialties: [String],
    active: { type: Boolean, default: true },
    color: { type: String, default: "#3B82F6" }, // Calendar color

    // Admin system working hours (array format)
    workingHours: [WorkingHoursSchema],

    // Legacy working hours (object format) - kept for backward compatibility
    legacyWorkingHours: {
      mon: DaySchema,
      tue: DaySchema,
      wed: DaySchema,
      thu: DaySchema,
      fri: DaySchema,
      sat: DaySchema,
      sun: DaySchema,
    },

    // Time off periods
    timeOff: [
      {
        start: Date,
        end: Date,
        reason: String,
      },
    ],

    // Profile image for admin system
    image: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },

    // Stripe Connect fields
    stripeAccountId: { type: String, index: true },
    stripeStatus: {
      type: String,
      enum: ["not_connected", "pending", "connected", "rejected"],
      default: "not_connected",
    },
    stripeOnboardingCompleted: { type: Boolean, default: false },
    totalEarnings: { type: Number, default: 0 }, // Total revenue from bookings + products
    totalPayouts: { type: Number, default: 0 }, // Total amount paid out by Stripe
    lastPayoutDate: Date,
  },
  { timestamps: true }
);

// Performance indexes for common queries
BeauticianSchema.index({ active: 1, createdAt: -1 }); // Active beauticians
BeauticianSchema.index({ email: 1 }); // Email lookups
BeauticianSchema.index({ stripeStatus: 1 }); // Stripe onboarding status
BeauticianSchema.index({ stripeAccountId: 1 }); // Already has index

export default mongoose.model("Beautician", BeauticianSchema);
