import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

/**
 * Optional authentication middleware
 * Checks for JWT token and attaches admin to request if valid
 * Does NOT return error if token is missing or invalid (continues as guest)
 * 
 * Sets req.admin if authenticated, otherwise undefined
 * 
 * @param {import('express').Request} req
 * @param {import('express').Response} res
 * @param {import('express').NextFunction} next
 */
export async function optionalAuth(req, res, next) {
  try {
    // 1) Get token from header
    let token;
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith("Bearer")
    ) {
      token = req.headers.authorization.split(" ")[1];
    }

    // No token = continue as guest
    if (!token) {
      return next();
    }

    // 2) Verify token
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (jwtError) {
      // Invalid token - continue as guest
      return next();
    }

    // 3) Check if admin still exists and is active
    const admin = await Admin.findById(decoded.id).select(
      "_id name email role beauticianId active passwordChangedAt"
    );

    if (!admin || !admin.active) {
      // Admin doesn't exist or is inactive - continue as guest
      return next();
    }

    // 4) Check if password was changed after token was issued
    if (admin.changedPasswordAfter && admin.changedPasswordAfter(decoded.iat)) {
      // Password changed - continue as guest
      return next();
    }

    // 5) Attach admin to request
    req.admin = admin;
    next();
  } catch (error) {
    // Any error - log it but continue as guest (don't block request)
    console.error("optionalAuth middleware error:", error);
    next();
  }
}

export default optionalAuth;
