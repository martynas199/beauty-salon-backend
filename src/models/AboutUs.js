import mongoose from "mongoose";

const AboutUsSchema = new mongoose.Schema(
  {
    image: {
      url: { type: String, required: true },
      publicId: { type: String }, // For Cloudinary management
    },
    quote: {
      type: String,
      required: true,
      maxlength: 500,
    },
    description: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
  },
  { timestamps: true }
);

// Ensure only one active About Us record exists
AboutUsSchema.index(
  { isActive: 1 },
  { unique: true, partialFilterExpression: { isActive: true } }
);

export default mongoose.model("AboutUs", AboutUsSchema);
