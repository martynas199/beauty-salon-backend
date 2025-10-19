import { Router } from "express";
import Beautician from "../models/Beautician.js";
import Service from "../models/Service.js";
import {
  validateCreateBeautician,
  validateUpdateBeautician,
  listBeauticiansQuerySchema,
  beauticianIdSchema,
} from "../validations/beautician.schema.js";
import requireAdmin from "../middleware/requireAdmin.js";
import multer from "multer";
import { uploadImage, deleteImage } from "../utils/cloudinary.js";
import fs from "fs";

const r = Router();

// Multer setup: Temporary file storage
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
 * GET /api/beauticians
 * List beauticians with optional filters
 * Query params: active, serviceId, limit, skip
 */
r.get("/", async (req, res, next) => {
  try {
    // Validate query params
    const queryValidation = listBeauticiansQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryValidation.error.errors,
      });
    }

    const { active, serviceId, limit = 100, skip = 0 } = queryValidation.data;

    // Build query
    const query = {};
    if (active && active !== "all") {
      query.active = active === "true";
    }

    // If filtering by service, find beauticians assigned to that service
    if (serviceId) {
      const service = await Service.findById(serviceId).lean();
      if (!service) {
        return res.status(404).json({ error: "Service not found" });
      }

      const beauticianIds = [
        service.primaryBeauticianId,
        ...(service.additionalBeauticianIds || []),
      ].filter(Boolean);

      query._id = { $in: beauticianIds };
    }

    const docs = await Beautician.find(query)
      .limit(limit)
      .skip(skip)
      .sort({ name: 1 })
      .lean();

    res.json(docs);
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/beauticians/:id
 * Get single beautician by ID
 */
r.get("/:id", async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid beautician ID",
        details: idValidation.error.errors,
      });
    }

    const beautician = await Beautician.findById(req.params.id).lean();

    if (!beautician) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json(beautician);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/beauticians
 * Create a new beautician (admin only)
 */
r.post("/", requireAdmin, async (req, res, next) => {
  try {
    // Validate request body
    const validation = validateCreateBeautician(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const created = await Beautician.create(validation.data);
    res.status(201).json(created);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Beautician already exists",
        details: "A beautician with this email may already exist",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/beauticians/:id
 * Update a beautician (admin only)
 */
r.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid beautician ID",
        details: idValidation.error.errors,
      });
    }

    // Validate request body
    const validation = validateUpdateBeautician(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const updated = await Beautician.findByIdAndUpdate(
      req.params.id,
      { $set: validation.data },
      { new: true, runValidators: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/beauticians/:id
 * Delete a beautician (admin only)
 * Note: Consider soft-delete (active: false) in production
 * Also consider checking if beautician is assigned to any services
 */
r.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = beauticianIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid beautician ID",
        details: idValidation.error.errors,
      });
    }

    // Check if beautician is assigned to any services
    const servicesWithBeautician = await Service.countDocuments({
      $or: [
        { primaryBeauticianId: req.params.id },
        { additionalBeauticianIds: req.params.id },
      ],
    });

    if (servicesWithBeautician > 0) {
      return res.status(400).json({
        error: "Cannot delete beautician",
        details: `This beautician is assigned to ${servicesWithBeautician} service(s). Please reassign or remove them first.`,
      });
    }

    const deleted = await Beautician.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Beautician not found" });
    }

    res.json({ ok: true, message: "Beautician deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/beauticians/:id/upload-image
 * Upload profile image for a beautician (admin only)
 */
r.post(
  "/:id/upload-image",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = beauticianIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid beautician ID",
          details: idValidation.error.errors,
        });
      }

      // Check if file was uploaded
      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Find beautician
      const beautician = await Beautician.findById(req.params.id);
      if (!beautician) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Beautician not found" });
      }

      try {
        // Delete old image from Cloudinary if exists
        if (
          beautician.image?.provider === "cloudinary" &&
          beautician.image?.id
        ) {
          try {
            await deleteImage(beautician.image.id);
          } catch (deleteErr) {
            console.error("Error deleting old image:", deleteErr);
            // Continue with upload even if old image deletion fails
          }
        }

        // Upload to Cloudinary
        const result = await uploadImage(req.file.path, "beauticians");

        // Update beautician with new image
        beautician.image = {
          provider: "cloudinary",
          id: result.public_id,
          url: result.secure_url,
          alt: beautician.name,
          width: result.width,
          height: result.height,
        };

        await beautician.save();

        // Clean up temp file
        deleteLocalFile(req.file.path);

        res.json({
          message: "Image uploaded successfully",
          image: beautician.image,
        });
      } catch (uploadErr) {
        // Clean up temp file on error
        deleteLocalFile(req.file.path);
        throw uploadErr;
      }
    } catch (err) {
      next(err);
    }
  }
);

export default r;
