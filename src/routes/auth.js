import { Router } from "express";
import jwt from "jsonwebtoken";
import { z } from "zod";
import Admin from "../models/Admin.js";

const r = Router();

// JWT secret from environment or default (CHANGE IN PRODUCTION!)
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "7d";
const JWT_COOKIE_EXPIRES_IN = process.env.JWT_COOKIE_EXPIRES_IN || 7; // days

// Validation schemas
const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  role: z.enum(["admin", "super_admin"]).optional(),
});

// Helper function to sign JWT token
const signToken = (id) => {
  return jwt.sign({ id }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
};

// Helper function to send token response
const sendTokenResponse = (admin, statusCode, res) => {
  const token = signToken(admin._id);

  // Cookie options
  const cookieOptions = {
    expires: new Date(Date.now() + JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000),
    httpOnly: true, // Cannot be accessed by client-side JavaScript
    secure: process.env.NODE_ENV === "production", // Only sent over HTTPS in production
    sameSite: "lax", // CSRF protection
  };

  // Send cookie and response
  res
    .status(statusCode)
    .cookie("jwt", token, cookieOptions)
    .json({
      success: true,
      token,
      admin: {
        _id: admin._id,
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        active: admin.active,
        lastLogin: admin.lastLogin,
        beauticianId: admin.beauticianId, // Added for Stripe Connect
      },
    });
};

/**
 * POST /api/auth/register
 * Register a new admin (only for super_admin or initial setup)
 * Note: In production, you might want to restrict this or require super_admin auth
 */
r.post("/register", async (req, res) => {
  try {
    // Validate request body
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { email, password, name, role } = validation.data;

    // Check if admin already exists
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(409).json({
        error: "Admin with this email already exists",
      });
    }

    // Create admin
    const admin = await Admin.create({
      email,
      password,
      name,
      role: role || "admin",
    });

    // Send token response
    sendTokenResponse(admin, 201, res);
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({
      error: "Failed to register admin",
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
r.post("/login", async (req, res) => {
  try {
    // Validate request body
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: "Validation failed",
        details: validation.error.errors,
      });
    }

    const { email, password } = validation.data;

    // Find admin by email (include password for comparison)
    const admin = await Admin.findOne({ email }).select("+password");

    if (!admin || !admin.active) {
      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Check if account is locked
    if (admin.isLocked()) {
      return res.status(423).json({
        error:
          "Account is temporarily locked due to too many failed login attempts",
        lockUntil: admin.lockUntil,
      });
    }

    // Check password
    const isPasswordCorrect = await admin.comparePassword(password);

    if (!isPasswordCorrect) {
      // Increment login attempts
      await admin.incLoginAttempts();

      return res.status(401).json({
        error: "Invalid email or password",
      });
    }

    // Reset login attempts on successful login
    await admin.resetLoginAttempts();

    // Send token response
    sendTokenResponse(admin, 200, res);
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({
      error: "Failed to login",
      details: error.message,
    });
  }
});

/**
 * POST /api/auth/logout
 * Logout and clear cookie
 */
r.post("/logout", (req, res) => {
  res
    .cookie("jwt", "loggedout", {
      expires: new Date(Date.now() + 10 * 1000), // 10 seconds
      httpOnly: true,
    })
    .json({
      success: true,
      message: "Logged out successfully",
    });
});

/**
 * GET /api/auth/me
 * Get current logged in admin
 * Requires authentication middleware
 */
r.get("/me", async (req, res) => {
  try {
    // Get token from header or cookie
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        error: "Not authenticated. Please log in.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find admin
    const admin = await Admin.findById(decoded.id);

    if (!admin || !admin.active) {
      return res.status(401).json({
        error: "Admin no longer exists or is inactive",
      });
    }

    // Check if password was changed after token was issued
    if (admin.changedPasswordAfter(decoded.iat)) {
      return res.status(401).json({
        error: "Password was recently changed. Please log in again.",
      });
    }

    res.json({
      success: true,
      admin: {
        _id: admin._id,
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        active: admin.active,
        lastLogin: admin.lastLogin,
        beauticianId: admin.beauticianId, // Added for Stripe Connect
      },
    });
  } catch (error) {
    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        error: "Invalid token. Please log in again.",
      });
    }
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        error: "Your token has expired. Please log in again.",
      });
    }

    console.error("Auth me error:", error);
    res.status(500).json({
      error: "Failed to get admin info",
      details: error.message,
    });
  }
});

/**
 * PATCH /api/auth/me
 * Update current admin profile (name, email)
 */
r.patch("/me", async (req, res) => {
  try {
    // Get token
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        error: "Not authenticated. Please log in.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find admin
    const admin = await Admin.findById(decoded.id);

    if (!admin) {
      return res.status(401).json({
        error: "Admin not found",
      });
    }

    const { name, email } = req.body;

    // Validate input
    if (!name || name.trim().length === 0) {
      return res.status(400).json({
        error: "Name is required",
      });
    }

    if (!email || !email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        error: "Valid email is required",
      });
    }

    // Check if email is already taken by another admin
    if (email !== admin.email) {
      const existingAdmin = await Admin.findOne({ email });
      if (existingAdmin) {
        return res.status(409).json({
          error: "Email is already in use by another admin",
        });
      }
    }

    // Update admin
    admin.name = name.trim();
    admin.email = email.trim().toLowerCase();
    await admin.save();

    res.json({
      success: true,
      message: "Profile updated successfully",
      admin: {
        _id: admin._id,
        id: admin._id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        active: admin.active,
        lastLogin: admin.lastLogin,
        beauticianId: admin.beauticianId, // Added for Stripe Connect
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);
    res.status(500).json({
      error: "Failed to update profile",
      details: error.message,
    });
  }
});

/**
 * PATCH /api/auth/change-password
 * Change password for logged in admin
 */
r.patch("/change-password", async (req, res) => {
  try {
    // Get token
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    } else if (req.cookies.jwt) {
      token = req.cookies.jwt;
    }

    if (!token) {
      return res.status(401).json({
        error: "Not authenticated. Please log in.",
      });
    }

    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET);

    // Find admin with password
    const admin = await Admin.findById(decoded.id).select("+password");

    if (!admin) {
      return res.status(401).json({
        error: "Admin not found",
      });
    }

    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        error: "Please provide current and new password",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        error: "New password must be at least 8 characters",
      });
    }

    // Check current password
    const isPasswordCorrect = await admin.comparePassword(currentPassword);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        error: "Current password is incorrect",
      });
    }

    // Update password
    admin.password = newPassword;
    await admin.save();

    // Send new token
    sendTokenResponse(admin, 200, res);
  } catch (error) {
    console.error("Change password error:", error);
    res.status(500).json({
      error: "Failed to change password",
      details: error.message,
    });
  }
});

export default r;
