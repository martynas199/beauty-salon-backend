import mongoose from "mongoose";

const SettingsSchema = new mongoose.Schema(
  {
    // Singleton pattern - only one settings document
    _id: { type: String, default: "salon-settings" },

    // Salon Working Hours
    workingHours: {
      mon: { start: String, end: String },
      tue: { start: String, end: String },
      wed: { start: String, end: String },
      thu: { start: String, end: String },
      fri: { start: String, end: String },
      sat: { start: String, end: String },
      sun: { start: String, end: String },
    },

    // Salon Information
    salonName: String,
    salonDescription: String,
    salonAddress: String,
    salonPhone: String,
    salonEmail: String,

    // Salon Images
    heroImage: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },

    // Products Page Hero Image
    productsHeroImage: {
      provider: String,
      publicId: String,
      url: String,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Settings", SettingsSchema);
