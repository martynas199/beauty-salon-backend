import { Router } from "express";
import Service from "../models/Service.js";
import {
  validateCreateService,
  validateUpdateService,
  listServicesQuerySchema,
  serviceIdSchema,
} from "../validations/service.schema.js";
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
 * GET /api/services
 * List services with optional filters
 * Query params: active, category, beauticianId, limit, skip
 */
r.get("/", async (req, res, next) => {
  try {
    // Validate query params
    const queryValidation = listServicesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        error: "Invalid query parameters",
        details: queryValidation.error.errors,
      });
    }

    const {
      active,
      category,
      beauticianId,
      limit = 100,
      skip = 0,
    } = queryValidation.data;

    // Build query
    const query = {};
    if (active && active !== "all") {
      query.active = active === "true";
    }
    if (category) {
      query.category = category;
    }
    if (beauticianId) {
      query.$or = [
        { primaryBeauticianId: beauticianId },
        { additionalBeauticianIds: beauticianId },
      ];
    }

    const docs = await Service.find(query)
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
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
 * GET /api/services/:id
 * Get single service by ID
 */
r.get("/:id", async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = serviceIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid service ID",
        details: idValidation.error.errors,
      });
    }

    const service = await Service.findById(req.params.id)
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
      .lean();

    if (!service) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json(service);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/services
 * Create a new service (admin only)
 */
r.post("/", requireAdmin, async (req, res, next) => {
  try {
    // Validate request body
    const validation = validateCreateService(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const created = await Service.create(validation.data);
    const populated = await Service.findById(created._id)
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
      .lean();

    res.status(201).json(populated);
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        error: "Service already exists",
        details: "A service with this name may already exist",
      });
    }
    next(err);
  }
});

/**
 * PATCH /api/services/:id
 * Update a service (admin only)
 */
r.patch("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = serviceIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid service ID",
        details: idValidation.error.errors,
      });
    }

    // Validate request body
    const validation = validateUpdateService(req.body);
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const updated = await Service.findByIdAndUpdate(
      req.params.id,
      { $set: validation.data },
      { new: true, runValidators: true }
    )
      .populate({ path: "primaryBeauticianId", select: "name email" })
      .populate({ path: "additionalBeauticianIds", select: "name email" })
      .lean();

    if (!updated) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/services/:id
 * Delete a service (admin only)
 * Note: Consider soft-delete (active: false) in production
 */
r.delete("/:id", requireAdmin, async (req, res, next) => {
  try {
    // Validate ID
    const idValidation = serviceIdSchema.safeParse(req.params);
    if (!idValidation.success) {
      return res.status(400).json({
        error: "Invalid service ID",
        details: idValidation.error.errors,
      });
    }

    const deleted = await Service.findByIdAndDelete(req.params.id);

    if (!deleted) {
      return res.status(404).json({ error: "Service not found" });
    }

    res.json({ ok: true, message: "Service deleted successfully" });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/services/:id/upload-image
 * Upload main service image to Cloudinary (admin only)
 */
r.post(
  "/:id/upload-image",
  requireAdmin,
  upload.single("image"),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = serviceIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid service ID",
          details: idValidation.error.errors,
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: "No image file provided" });
      }

      // Find service
      const service = await Service.findById(req.params.id);
      if (!service) {
        deleteLocalFile(req.file.path);
        return res.status(404).json({ error: "Service not found" });
      }

      try {
        // Upload new image to Cloudinary
        const result = await uploadImage(
          req.file.path,
          "beauty-salon/services"
        );

        // Delete old image from Cloudinary if exists
        if (service.image?.provider === "cloudinary" && service.image?.id) {
          try {
            await deleteImage(service.image.id);
          } catch (err) {
            console.error("Failed to delete old image from Cloudinary:", err);
          }
        }

        // Update service with new image
        service.image = {
          provider: "cloudinary",
          id: result.public_id,
          url: result.secure_url,
          alt: service.name,
          width: result.width,
          height: result.height,
        };
        await service.save();

        // Clean up local file
        deleteLocalFile(req.file.path);

        res.json({
          ok: true,
          message: "Image uploaded successfully",
          image: service.image,
        });
      } catch (err) {
        deleteLocalFile(req.file.path);
        throw err;
      }
    } catch (err) {
      if (req.file) deleteLocalFile(req.file.path);
      next(err);
    }
  }
);

/**
 * POST /api/services/:id/upload-gallery
 * Upload gallery images to Cloudinary (admin only)
 */
r.post(
  "/:id/upload-gallery",
  requireAdmin,
  upload.array("images", 10),
  async (req, res, next) => {
    try {
      // Validate ID
      const idValidation = serviceIdSchema.safeParse(req.params);
      if (!idValidation.success) {
        return res.status(400).json({
          error: "Invalid service ID",
          details: idValidation.error.errors,
        });
      }

      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "No image files provided" });
      }

      // Find service
      const service = await Service.findById(req.params.id);
      if (!service) {
        req.files.forEach((file) => deleteLocalFile(file.path));
        return res.status(404).json({ error: "Service not found" });
      }

      try {
        const uploadedImages = [];

        // Upload each image
        for (const file of req.files) {
          try {
            const result = await uploadImage(
              file.path,
              "beauty-salon/services/gallery"
            );
            uploadedImages.push({
              provider: "cloudinary",
              id: result.public_id,
              url: result.secure_url,
              alt: service.name,
              width: result.width,
              height: result.height,
            });
            deleteLocalFile(file.path);
          } catch (err) {
            console.error("Failed to upload gallery image:", err);
            deleteLocalFile(file.path);
          }
        }

        // Add to service gallery
        if (!service.gallery) service.gallery = [];
        service.gallery.push(...uploadedImages);
        await service.save();

        res.json({
          ok: true,
          message: `${uploadedImages.length} image(s) uploaded successfully`,
          gallery: service.gallery,
        });
      } catch (err) {
        req.files.forEach((file) => deleteLocalFile(file.path));
        throw err;
      }
    } catch (err) {
      if (req.files) {
        req.files.forEach((file) => deleteLocalFile(file.path));
      }
      next(err);
    }
  }
);

export default r;
