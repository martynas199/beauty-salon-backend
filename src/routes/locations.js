import { Router } from "express";
import Location from "../models/Location.js";
import { requireAdmin, requireSuperAdmin } from "../middleware/requireAdmin.js";
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";

const r = Router();

// Multer setup for image uploads
const upload = multer({ dest: "uploads/" });

// Helper: Delete local file
const deleteLocalFile = (path) => {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    console.error("Error deleting local file:", err);
  }
};

/**
 * GET /api/locations
 * Public endpoint - list all active locations
 * Query params: all (super admin only)
 */
r.get("/", async (req, res) => {
  try {
    const query = {};

    // Only super admins can see inactive locations
    if (req.query.all !== "true") {
      query.active = true;
    }

    const locations = await Location.find(query)
      .sort({ order: 1, name: 1 })
      .lean();

    res.json(locations);
  } catch (error) {
    console.error("Error fetching locations:", error);
    res.status(500).json({ error: "Failed to fetch locations" });
  }
});

/**
 * GET /api/locations/:id
 * Get single location by ID
 */
r.get("/:id", async (req, res) => {
  try {
    const location = await Location.findById(req.params.id).lean();

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(location);
  } catch (error) {
    console.error("Error fetching location:", error);
    res.status(500).json({ error: "Failed to fetch location" });
  }
});

/**
 * POST /api/locations
 * Create new location (super admin only)
 */
r.post("/", requireSuperAdmin, async (req, res) => {
  try {
    const location = await Location.create(req.body);
    res.status(201).json(location);
  } catch (error) {
    console.error("Error creating location:", error);
    res.status(500).json({ error: "Failed to create location" });
  }
});

/**
 * PATCH /api/locations/:id
 * Update location (super admin only)
 */
r.patch("/:id", requireSuperAdmin, async (req, res) => {
  try {
    const location = await Location.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    res.json(location);
  } catch (error) {
    console.error("Error updating location:", error);
    res.status(500).json({ error: "Failed to update location" });
  }
});

/**
 * DELETE /api/locations/:id
 * Delete location (super admin only)
 */
r.delete("/:id", requireSuperAdmin, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Delete image from Cloudinary if exists
    if (location.image?.provider === "cloudinary" && location.image?.id) {
      try {
        await deleteImage(location.image.id);
      } catch (err) {
        console.error("Error deleting location image from Cloudinary:", err);
      }
    }

    await location.deleteOne();
    res.json({ message: "Location deleted successfully" });
  } catch (error) {
    console.error("Error deleting location:", error);
    res.status(500).json({ error: "Failed to delete location" });
  }
});

/**
 * POST /api/locations/:id/upload-image
 * Upload location image (super admin only)
 */
r.post(
  "/:id/upload-image",
  requireSuperAdmin,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      const location = await Location.findById(req.params.id);
      if (!location) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Location not found" });
      }

      // Delete old image from Cloudinary if exists
      if (location.image?.provider === "cloudinary" && location.image?.id) {
        try {
          await deleteImage(location.image.id);
        } catch (err) {
          console.error("Error deleting old location image:", err);
        }
      }

      // Upload to Cloudinary
      const cloudinaryResult = await uploadImage(req.file.path, {
        folder: "locations",
        transformation: [{ width: 800, height: 600, crop: "fill" }],
      });

      // Update location with new image
      location.image = {
        provider: "cloudinary",
        id: cloudinaryResult.public_id,
        url: cloudinaryResult.secure_url,
        alt: location.name,
        width: cloudinaryResult.width,
        height: cloudinaryResult.height,
      };

      await location.save();

      // Clean up local file
      deleteLocalFile(req.file.path);

      res.json(location.image);
    } catch (error) {
      console.error("Error uploading location image:", error);
      if (req.file?.path) {
        deleteLocalFile(req.file.path);
      }
      res.status(500).json({ error: "Failed to upload image" });
    }
  },
);

/**
 * DELETE /api/locations/:id/image
 * Delete location image (super admin only)
 */
r.delete("/:id/image", requireSuperAdmin, async (req, res) => {
  try {
    const location = await Location.findById(req.params.id);

    if (!location) {
      return res.status(404).json({ error: "Location not found" });
    }

    // Delete from Cloudinary if exists
    if (location.image?.provider === "cloudinary" && location.image?.id) {
      try {
        await deleteImage(location.image.id);
      } catch (err) {
        console.error("Error deleting location image from Cloudinary:", err);
      }
    }

    location.image = undefined;
    await location.save();

    res.json({ message: "Image deleted successfully" });
  } catch (error) {
    console.error("Error deleting location image:", error);
    res.status(500).json({ error: "Failed to delete image" });
  }
});

export default r;
