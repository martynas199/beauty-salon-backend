import { Router } from "express";
import Settings from "../models/Settings.js";
import requireAdmin from "../middleware/requireAdmin.js";

const r = Router();

/**
 * GET /api/settings
 * Get salon settings
 */
r.get("/", async (req, res, next) => {
  try {
    let settings = await Settings.findById("salon-settings").lean();

    // If no settings exist, create default ones
    if (!settings) {
      settings = await Settings.create({
        _id: "salon-settings",
        workingHours: {
          mon: { start: "09:00", end: "17:00" },
          tue: { start: "09:00", end: "17:00" },
          wed: { start: "09:00", end: "17:00" },
          thu: { start: "09:00", end: "17:00" },
          fri: { start: "09:00", end: "17:00" },
          sat: { start: "09:00", end: "13:00" },
          sun: null,
        },
      });
    }

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/settings
 * Update salon settings (admin only)
 */
r.patch("/", requireAdmin, async (req, res, next) => {
  try {
    const {
      workingHours,
      salonName,
      salonDescription,
      salonAddress,
      salonPhone,
      salonEmail,
      heroImage,
    } = req.body;

    // Validate working hours format if provided
    if (workingHours) {
      const validDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      for (const day of validDays) {
        if (workingHours[day] !== undefined && workingHours[day] !== null) {
          if (!workingHours[day].start || !workingHours[day].end) {
            return res.status(400).json({
              error: `Invalid working hours for ${day}`,
            });
          }
        }
      }
    }

    let settings = await Settings.findById("salon-settings");

    if (!settings) {
      // Create new settings if none exist
      settings = await Settings.create({
        _id: "salon-settings",
        workingHours: workingHours || {},
        salonName,
        salonDescription,
        salonAddress,
        salonPhone,
        salonEmail,
        heroImage,
      });
    } else {
      // Update existing settings
      if (workingHours !== undefined) settings.workingHours = workingHours;
      if (salonName !== undefined) settings.salonName = salonName;
      if (salonDescription !== undefined)
        settings.salonDescription = salonDescription;
      if (salonAddress !== undefined) settings.salonAddress = salonAddress;
      if (salonPhone !== undefined) settings.salonPhone = salonPhone;
      if (salonEmail !== undefined) settings.salonEmail = salonEmail;
      if (heroImage !== undefined) settings.heroImage = heroImage;

      await settings.save();
    }

    res.json(settings);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/settings/upload-hero
 * Upload hero image for salon (admin only)
 */
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";

const upload = multer({ dest: "uploads/" });

const deleteLocalFile = (path) => {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
};

r.post(
  "/upload-hero",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Upload to Cloudinary
      const cloudinaryResult = await uploadImage(req.file.path, "salon-hero");

      // Delete local temp file
      deleteLocalFile(req.file.path);

      // Update settings with new hero image
      let settings = await Settings.findById("salon-settings");

      if (!settings) {
        settings = await Settings.create({
          _id: "salon-settings",
          heroImage: {
            provider: "cloudinary",
            id: cloudinaryResult.public_id,
            url: cloudinaryResult.secure_url,
            alt: "Salon hero image",
            width: cloudinaryResult.width,
            height: cloudinaryResult.height,
          },
        });
      } else {
        // Delete old image from Cloudinary if it exists
        if (
          settings.heroImage?.id &&
          settings.heroImage?.provider === "cloudinary"
        ) {
          try {
            await deleteImage(settings.heroImage.id);
          } catch (err) {
            console.error("Failed to delete old image:", err);
          }
        }

        settings.heroImage = {
          provider: "cloudinary",
          id: cloudinaryResult.public_id,
          url: cloudinaryResult.secure_url,
          alt: "Salon hero image",
          width: cloudinaryResult.width,
          height: cloudinaryResult.height,
        };

        await settings.save();
      }

      res.json(settings);
    } catch (err) {
      // Clean up temp file on error
      if (req.file) {
        deleteLocalFile(req.file.path);
      }
      next(err);
    }
  }
);

export default r;
