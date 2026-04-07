import { Router } from "express";
import Beautician from "../models/Beautician.js";
import Service from "../models/Service.js";
import Admin from "../models/Admin.js";
import jwt from "jsonwebtoken";
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
const MIN_TRAVEL_BUFFER_MINUTES = 45;
const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

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

const toLocationKey = (locationId) =>
  locationId ? String(locationId) : "__default__";

const hhmmToMinutes = (value) => {
  if (typeof value !== "string") return NaN;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return NaN;
  }
  return hours * 60 + minutes;
};

const formatSlotRange = (slot) => `${slot.start}-${slot.end}`;

function validateScheduleEntriesForSingleDay(entries, contextLabel) {
  const normalized = (entries || []).map((entry) => {
    const startMin = hhmmToMinutes(entry.start);
    const endMin = hhmmToMinutes(entry.end);
    return {
      ...entry,
      startMin,
      endMin,
      locationKey: toLocationKey(entry.locationId),
    };
  });

  const invalidSlot = normalized.find(
    (slot) =>
      !Number.isFinite(slot.startMin) ||
      !Number.isFinite(slot.endMin) ||
      slot.startMin >= slot.endMin,
  );
  if (invalidSlot) {
    return `${contextLabel}: invalid time range ${formatSlotRange(invalidSlot)}.`;
  }

  const byLocation = new Map();
  for (const slot of normalized) {
    if (!byLocation.has(slot.locationKey)) {
      byLocation.set(slot.locationKey, []);
    }
    byLocation.get(slot.locationKey).push(slot);
  }

  for (const slots of byLocation.values()) {
    const sorted = [...slots].sort((a, b) => a.startMin - b.startMin);
    for (let i = 1; i < sorted.length; i += 1) {
      const prev = sorted[i - 1];
      const current = sorted[i];
      if (current.startMin < prev.endMin) {
        return `${contextLabel}: overlapping time slots ${formatSlotRange(prev)} and ${formatSlotRange(current)} for the same location.`;
      }
    }
  }

  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const a = normalized[i];
      const b = normalized[j];

      if (
        !a.locationId ||
        !b.locationId ||
        String(a.locationId) === String(b.locationId)
      ) {
        continue;
      }

      const overlaps = a.startMin < b.endMin && b.startMin < a.endMin;
      if (overlaps) {
        return `${contextLabel}: ${formatSlotRange(a)} overlaps ${formatSlotRange(b)} across locations.`;
      }

      const gapMin =
        a.endMin <= b.startMin ? b.startMin - a.endMin : a.startMin - b.endMin;

      if (gapMin < MIN_TRAVEL_BUFFER_MINUTES) {
        return `${contextLabel}: not enough travel time between ${formatSlotRange(a)} and ${formatSlotRange(b)} across locations. Minimum gap is ${MIN_TRAVEL_BUFFER_MINUTES} minutes.`;
      }
    }
  }

  return null;
}

function validateWorkingHoursConflicts(workingHours = []) {
  const byDay = new Map();

  for (const entry of workingHours) {
    const dayOfWeek = Number(entry.dayOfWeek);
    if (!byDay.has(dayOfWeek)) {
      byDay.set(dayOfWeek, []);
    }
    byDay.get(dayOfWeek).push(entry);
  }

  for (const [dayOfWeek, entries] of byDay.entries()) {
    const dayName = DAY_NAMES[dayOfWeek] || `Day ${dayOfWeek}`;
    const error = validateScheduleEntriesForSingleDay(
      entries,
      `Working hours (${dayName})`,
    );
    if (error) return error;
  }

  return null;
}

function validateCustomScheduleConflicts(customSchedule = {}) {
  const scheduleEntries =
    customSchedule instanceof Map
      ? Object.fromEntries(customSchedule)
      : customSchedule || {};

  for (const [date, entries] of Object.entries(scheduleEntries)) {
    if (!Array.isArray(entries) || entries.length === 0) continue;
    const error = validateScheduleEntriesForSingleDay(
      entries,
      `Custom schedule (${date})`,
    );
    if (error) return error;
  }

  return null;
}

/**
 * GET /api/beauticians
 * List beauticians with optional filters
 * Query params: active, serviceId, page, limit
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

    const {
      active,
      serviceId,
      locationId,
      limit = 20,
      skip = 0,
    } = queryValidation.data;

    // Parse pagination params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageLimit = Math.min(
      100,
      Math.max(1, parseInt(req.query.limit) || limit)
    );
    const pageSkip = req.query.page ? (page - 1) * pageLimit : skip;

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

    if (locationId) {
      query.locationIds = locationId;
    }

    // Get total count for pagination
    const total = await Beautician.countDocuments(query);

    const docs = await Beautician.find(query)
      .limit(pageLimit)
      .skip(pageSkip)
      .sort({ name: 1 })
      .lean();

    // Convert Map to plain object for customSchedule (if it's still a Map)
    docs.forEach((doc) => {
      if (doc.customSchedule && doc.customSchedule instanceof Map) {
        doc.customSchedule = Object.fromEntries(doc.customSchedule);
      }
    });

    // Return paginated response if page param is used
    if (req.query.page) {
      res.json({
        data: docs,
        pagination: {
          page,
          limit: pageLimit,
          total,
          totalPages: Math.ceil(total / pageLimit),
          hasMore: page * pageLimit < total,
        },
      });
    } else {
      // Backward compatibility: return array if no page param
      res.json(docs);
    }
  } catch (err) {
    next(err);
  }
});

/**
 * PATCH /api/beauticians/me/working-hours
 * Update working hours for the logged-in beautician
 * Requires authentication but not admin
 */
r.patch("/me/working-hours", async (req, res, next) => {
  try {
    console.log("[Working Hours] Headers:", req.headers.authorization);
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      console.log("[Working Hours] No token found in request");
      return res.status(401).json({ error: "Authentication required" });
    }

    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET || "your-secret-key");
      console.log("[Working Hours] Decoded token:", decoded);
    } catch (err) {
      console.log("[Working Hours] Token verification failed:", err.message);
      return res.status(401).json({ error: "Invalid token" });
    }

    // Support both admin tokens (id) and user tokens (userId)
    const userId = decoded.userId || decoded.id;
    console.log("[Working Hours] User ID from token:", userId);

    if (!userId) {
      console.log("[Working Hours] No userId in token payload");
      return res.status(401).json({ error: "Invalid token payload" });
    }

    // Find admin user to get their beauticianId
    const admin = await Admin.findById(userId);
    console.log(
      "[Working Hours] Found admin:",
      admin ? admin._id : "null",
      "beauticianId:",
      admin?.beauticianId
    );

    if (!admin || !admin.beauticianId) {
      return res
        .status(404)
        .json({
          error: "No beautician profile associated with this admin account",
        });
    }

    // Find beautician by beauticianId
    const beautician = await Beautician.findById(admin.beauticianId);
    console.log(
      "[Working Hours] Found beautician:",
      beautician ? beautician._id : "null"
    );

    if (!beautician) {
      return res.status(404).json({ error: "Beautician profile not found" });
    }

    const { workingHours } = req.body;

    // Validate working hours format
    if (!Array.isArray(workingHours)) {
      return res.status(400).json({ error: "workingHours must be an array" });
    }

    const validation = validateUpdateBeautician({ workingHours });
    if (!validation.success) {
      const errorMessages = validation.errors.map((e) => e.message).join(", ");
      return res.status(400).json({
        error: errorMessages || "Validation failed",
        details: validation.errors,
      });
    }

    const workingHoursConflictError = validateWorkingHoursConflicts(
      validation.data.workingHours || [],
    );
    if (workingHoursConflictError) {
      return res.status(400).json({ error: workingHoursConflictError });
    }

    // Update working hours
    beautician.workingHours = validation.data.workingHours;
    await beautician.save();

    console.log("[Working Hours] Successfully updated working hours");
    res.json(beautician);
  } catch (err) {
    console.error("[Working Hours] Error:", err);
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

    // Convert Map to plain object for customSchedule if it exists (only if it's still a Map)
    if (beautician.customSchedule && beautician.customSchedule instanceof Map) {
      beautician.customSchedule = Object.fromEntries(beautician.customSchedule);
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

    const workingHoursConflictError = validateWorkingHoursConflicts(
      validation.data.workingHours || [],
    );
    if (workingHoursConflictError) {
      return res.status(400).json({ error: workingHoursConflictError });
    }

    const customScheduleConflictError = validateCustomScheduleConflicts(
      validation.data.customSchedule || {},
    );
    if (customScheduleConflictError) {
      return res.status(400).json({ error: customScheduleConflictError });
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

    if (validation.data.workingHours) {
      const workingHoursConflictError = validateWorkingHoursConflicts(
        validation.data.workingHours,
      );
      if (workingHoursConflictError) {
        return res.status(400).json({ error: workingHoursConflictError });
      }
    }

    if (validation.data.customSchedule) {
      const customScheduleConflictError = validateCustomScheduleConflicts(
        validation.data.customSchedule,
      );
      if (customScheduleConflictError) {
        return res.status(400).json({ error: customScheduleConflictError });
      }
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
