import mongoose from "mongoose";

const LocationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      street: String,
      city: String,
      postcode: String,
      country: { type: String, default: "United Kingdom" },
    },
    contact: {
      phone: String,
      email: String,
    },
    coordinates: {
      latitude: Number,
      longitude: Number,
    },
    image: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },
    description: String,
    active: { type: Boolean, default: true, index: true },
    order: { type: Number, default: 0 }, // For display ordering
  },
  { timestamps: true },
);

// Index for active locations
LocationSchema.index({ active: 1, order: 1 });

export default mongoose.model("Location", LocationSchema);
