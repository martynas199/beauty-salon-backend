import mongoose from "mongoose";
const VariantSchema = new mongoose.Schema(
  {
    name: String,
    durationMin: Number,
    price: Number,
    bufferBeforeMin: { type: Number, default: 0 },
    bufferAfterMin: { type: Number, default: 10 },
  },
  { _id: false }
);
const ServiceSchema = new mongoose.Schema(
  {
    name: String,
    description: String,
    category: String,
    imageUrl: String,
    variants: [VariantSchema],
    // Admin system field (preferred) - single primary beautician
    primaryBeauticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Beautician",
    },
    // Admin system field - additional beauticians who can perform this service
    additionalBeauticianIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Beautician" },
    ],
    // Preferred single-beautician assignment (legacy)
    beauticianId: { type: mongoose.Schema.Types.ObjectId, ref: "Beautician" },
    // Backwards-compatibility for older data
    beauticianIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Beautician" },
    ],
    // Additional fields for admin system
    price: Number,
    durationMin: Number,
    active: { type: Boolean, default: true },
    image: {
      provider: String,
      id: String,
      url: String,
      alt: String,
      width: Number,
      height: Number,
    },
    gallery: [
      {
        provider: String,
        id: String,
        url: String,
        alt: String,
        width: Number,
        height: Number,
      },
    ],
  },
  { timestamps: true }
);
export default mongoose.model("Service", ServiceSchema);
