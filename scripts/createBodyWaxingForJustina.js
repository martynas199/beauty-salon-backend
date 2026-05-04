import dotenv from "dotenv";
import mongoose from "mongoose";
import Beautician from "../src/models/Beautician.js";
import Service from "../src/models/Service.js";

dotenv.config();

const BODY_WAXING_VARIANTS = [
  { name: "Eyebrows", price: 8, durationMin: 10 },
  { name: "Upper lip", price: 6, durationMin: 5 },
  { name: "Chin", price: 6, durationMin: 5 },
  { name: "Full face", price: 18, durationMin: 20 },
  { name: "Underarms (hard wax)", price: 12, durationMin: 10 },
  { name: "Half arms", price: 15, durationMin: 15 },
  { name: "Full arms", price: 22, durationMin: 25 },
  { name: "Half legs", price: 18, durationMin: 20 },
  { name: "Full legs", price: 28, durationMin: 35 },
  { name: "Bikini", price: 15, durationMin: 15 },
  { name: "High bikini", price: 20, durationMin: 20 },
  { name: "Brazilian", price: 28, durationMin: 25 },
  { name: "Hollywood", price: 32, durationMin: 30 },
  { name: "Underarms + Bikini", price: 24, durationMin: 20 },
  { name: "Underarms + Hollywood", price: 38, durationMin: 35 },
  { name: "Half legs + Bikini", price: 30, durationMin: 30 },
  { name: "Full legs + Hollywood", price: 50, durationMin: 50 },
  { name: "Full legs + Hollywood + Underarms", price: 58, durationMin: 60 },
].map((variant) => ({
  ...variant,
  bufferBeforeMin: 0,
  bufferAfterMin: 0,
}));

async function main() {
  const mongoUri = process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGO_URI is missing in environment variables.");
  }

  await mongoose.connect(mongoUri);

  const beauticians = await Beautician.find({ name: "Justina" })
    .select("_id name")
    .lean();

  if (beauticians.length === 0) {
    throw new Error('No beautician found with exact name "Justina".');
  }

  if (beauticians.length > 1) {
    const ids = beauticians.map((b) => String(b._id)).join(", ");
    throw new Error(
      `Multiple beauticians found with exact name "Justina". IDs: ${ids}`,
    );
  }

  const justina = beauticians[0];

  const created = await Service.create({
    name: "Body Waxing",
    description:
      "Professional waxing services for face, upper body, legs, intimate areas, and bundles.",
    category: "Waxing",
    variants: BODY_WAXING_VARIANTS,
    primaryBeauticianId: justina._id,
    additionalBeauticianIds: [],
    active: true,
    priceVaries: true,
  });

  console.log("Created service:", {
    id: String(created._id),
    name: created.name,
    primaryBeauticianId: String(created.primaryBeauticianId),
    variantCount: created.variants.length,
  });
}

main()
  .catch((err) => {
    console.error("[createBodyWaxingForJustina] Failed:", err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {
      // no-op
    }
  });
