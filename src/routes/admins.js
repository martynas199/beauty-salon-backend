import express from "express";
import Admin from "../models/Admin.js";
import { requireAdmin } from "../middleware/requireAdmin.js";

const router = express.Router();

// Get all admins (requires authentication)
router.get("/", requireAdmin, async (req, res) => {
  try {
    const admins = await Admin.find().select("-password").lean();
    res.json(admins);
  } catch (error) {
    console.error("Error fetching admins:", error);
    res.status(500).json({ error: "Failed to fetch admins" });
  }
});

// Create new admin (requires authentication)
router.post("/", requireAdmin, async (req, res) => {
  try {
    const { email, password, name, role, beauticianId } = req.body;

    // Validate required fields
    if (!email || !password || !name) {
      return res.status(400).json({
        error: "Email, password, and name are required",
      });
    }

    // Validate password length
    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters long",
      });
    }

    // Check if admin with this email already exists
    const existingAdmin = await Admin.findOne({ email: email.toLowerCase() });
    if (existingAdmin) {
      return res.status(409).json({
        error: "An admin with this email already exists",
      });
    }

    // Create new admin
    const newAdmin = new Admin({
      email: email.toLowerCase(),
      password, // Will be hashed by the pre-save hook
      name,
      role: role || "admin",
      beauticianId: beauticianId || null,
      active: true,
    });

    await newAdmin.save();

    // Return new admin without password
    const adminResponse = await Admin.findById(newAdmin._id)
      .select("-password")
      .lean();

    res.status(201).json({
      message: "Admin created successfully",
      admin: adminResponse,
    });
  } catch (error) {
    console.error("Error creating admin:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({ error: messages.join(", ") });
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        error: "An admin with this email already exists",
      });
    }

    res.status(500).json({ error: "Failed to create admin" });
  }
});

// Link or unlink admin to beautician (requires authentication)
router.patch("/:adminId/link-beautician", requireAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const { beauticianId } = req.body;

    // Find the admin
    const admin = await Admin.findById(adminId);
    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    // Update the beautician link
    admin.beauticianId = beauticianId || null;
    await admin.save();

    // Return updated admin without password
    const updatedAdmin = await Admin.findById(adminId)
      .select("-password")
      .lean();

    res.json({
      message: beauticianId
        ? "Admin successfully linked to beautician"
        : "Admin successfully unlinked from beautician",
      admin: updatedAdmin,
    });
  } catch (error) {
    console.error("Error linking admin to beautician:", error);
    res.status(500).json({ error: "Failed to link admin to beautician" });
  }
});

// Get specific admin by ID (requires authentication)
router.get("/:adminId", requireAdmin, async (req, res) => {
  try {
    const { adminId } = req.params;
    const admin = await Admin.findById(adminId).select("-password").lean();

    if (!admin) {
      return res.status(404).json({ error: "Admin not found" });
    }

    res.json(admin);
  } catch (error) {
    console.error("Error fetching admin:", error);
    res.status(500).json({ error: "Failed to fetch admin" });
  }
});

export default router;
