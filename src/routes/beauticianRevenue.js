import { Router } from "express";
import jwt from "jsonwebtoken";
import Appointment from "../models/Appointment.js";
import Beautician from "../models/Beautician.js";
import Admin from "../models/Admin.js";

const router = Router();
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-this-in-production";

/**
 * Middleware to verify beautician/admin authentication
 */
const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = await Admin.findById(decoded.id).lean();

    if (!admin) {
      return res.status(401).json({ error: "Admin not found" });
    }

    // Check if admin has a linked beautician
    if (!admin.beauticianId) {
      return res.status(403).json({
        error: "No beautician profile linked to this account",
      });
    }

    req.admin = admin;
    req.beauticianId = admin.beauticianId;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
};

/**
 * GET /api/beautician-revenue/analytics
 * Get revenue analytics for the logged-in beautician
 * Query params:
 *   - month: YYYY-MM format (e.g., "2026-01")
 *   - year: YYYY format (e.g., "2026") - optional, used if month not specified
 */
router.get("/analytics", requireAuth, async (req, res) => {
  try {
    const { month, year } = req.query;
    const beauticianId = req.beauticianId;

    // Build date filter
    let startDate, endDate;

    if (month) {
      // Month specified (YYYY-MM format)
      const [y, m] = month.split("-");
      startDate = new Date(parseInt(y), parseInt(m) - 1, 1);
      endDate = new Date(parseInt(y), parseInt(m), 0, 23, 59, 59, 999);
    } else if (year) {
      // Year specified
      startDate = new Date(parseInt(year), 0, 1);
      endDate = new Date(parseInt(year), 11, 31, 23, 59, 59, 999);
    } else {
      // Default to current month
      const now = new Date();
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      endDate = new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );
    }

    // Fetch appointments for this beautician in the date range
    const appointments = await Appointment.find({
      beauticianId: beauticianId,
      start: {
        $gte: startDate,
        $lte: endDate,
      },
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "succeeded",
    })
      .select("start price payment client")
      .lean();

    // Calculate analytics
    let totalServiceValue = 0; // Total value of all services
    let totalDepositPaid = 0; // Actual deposit amounts paid
    let totalFullPaid = 0; // Full amounts paid
    let totalActualRevenue = 0; // Total money actually received
    let depositCount = 0;
    let fullPaymentCount = 0;

    appointments.forEach((apt) => {
      const servicePrice = Number(apt.price || 0);
      const paymentMode = apt.payment?.mode;

      totalServiceValue += servicePrice;

      // Use actual payment data from the appointment
      if (paymentMode === "deposit") {
        // For deposits, use amountTotal (which includes deposit + platform fee in pence)
        // Subtract platform fee to get actual revenue to beautician
        const amountTotalPence = Number(apt.payment?.amountTotal || 0);
        const platformFeePence = Number(apt.payment?.stripe?.platformFee || 0);
        const depositRevenuePence = amountTotalPence - platformFeePence;
        const depositAmount = depositRevenuePence / 100; // Convert to pounds

        totalDepositPaid += depositAmount;
        totalActualRevenue += depositAmount;
        depositCount++;
      } else {
        // For full payments, the entire service price was paid
        totalFullPaid += servicePrice;
        totalActualRevenue += servicePrice;
        fullPaymentCount++;
      }
    });

    // Get beautician details
    const beautician = await Beautician.findById(beauticianId)
      .select("name email stripeAccountId stripeStatus totalEarnings")
      .lean();

    // Calculate percentage breakdown (based on actual revenue received)
    const depositPercentage =
      totalActualRevenue > 0
        ? (totalDepositPaid / totalActualRevenue) * 100
        : 0;
    const fullPaymentPercentage =
      totalActualRevenue > 0 ? (totalFullPaid / totalActualRevenue) * 100 : 0;

    // Calculate remaining balance (for deposit appointments)
    const remainingBalance = totalServiceValue - totalActualRevenue;

    // Response data
    const response = {
      period: month || year || "current month",
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      beautician: {
        id: beautician._id,
        name: beautician.name,
        email: beautician.email,
        stripeConnected: beautician.stripeStatus === "connected",
        lifetimeEarnings: beautician.totalEarnings || 0,
      },
      summary: {
        totalServiceValue: parseFloat(totalServiceValue.toFixed(2)), // Total value of all services
        totalReceived: parseFloat(totalActualRevenue.toFixed(2)), // Actual money received
        remainingBalance: parseFloat(remainingBalance.toFixed(2)), // Money still owed (from deposits)
        totalAppointments: appointments.length,
        averageServiceValue:
          appointments.length > 0
            ? parseFloat((totalServiceValue / appointments.length).toFixed(2))
            : 0,
      },
      breakdown: {
        depositPayments: {
          amountReceived: parseFloat(totalDepositPaid.toFixed(2)), // Actual deposit amount paid
          count: depositCount,
          percentage: parseFloat(depositPercentage.toFixed(2)),
        },
        fullPayments: {
          amountReceived: parseFloat(totalFullPaid.toFixed(2)), // Full amount paid
          count: fullPaymentCount,
          percentage: parseFloat(fullPaymentPercentage.toFixed(2)),
        },
      },
      appointments: appointments.map((apt) => {
        const paymentMode = apt.payment?.mode;
        let amountPaid;

        if (paymentMode === "deposit") {
          const amountTotalPence = Number(apt.payment?.amountTotal || 0);
          const platformFeePence = Number(
            apt.payment?.stripe?.platformFee || 0
          );
          const depositRevenuePence = amountTotalPence - platformFeePence;
          amountPaid = depositRevenuePence / 100;
        } else {
          amountPaid = apt.price;
        }

        return {
          id: apt._id,
          date: apt.start,
          clientName: apt.client?.name,
          servicePrice: apt.price,
          paymentMode: paymentMode || "unknown",
          amountPaid: parseFloat(amountPaid.toFixed(2)),
          remainingBalance:
            paymentMode === "deposit" ? apt.price - amountPaid : 0,
        };
      }),
    };

    res.json(response);
  } catch (err) {
    res
      .status(500)
      .json({ error: err.message || "Failed to fetch revenue analytics" });
  }
});

/**
 * GET /api/beautician-revenue/months
 * Get list of months with revenue data for the beautician
 * Useful for populating month selector dropdown
 */
router.get("/months", requireAuth, async (req, res) => {
  try {
    const beauticianId = req.beauticianId;

    // Get earliest appointment date for this beautician
    const earliestAppointment = await Appointment.findOne({
      beauticianId: beauticianId,
      status: { $in: ["confirmed", "completed"] },
      "payment.status": "succeeded",
    })
      .select("start")
      .sort({ start: 1 })
      .lean();

    if (!earliestAppointment) {
      return res.json({ months: [] });
    }

    // Generate list of months from earliest to current
    const months = [];
    const startDate = new Date(earliestAppointment.start);
    const currentDate = new Date();

    let iterDate = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

    while (iterDate <= currentDate) {
      const year = iterDate.getFullYear();
      const month = String(iterDate.getMonth() + 1).padStart(2, "0");
      months.push({
        value: `${year}-${month}`,
        label: iterDate.toLocaleString("en-US", {
          month: "long",
          year: "numeric",
        }),
      });

      // Move to next month
      iterDate.setMonth(iterDate.getMonth() + 1);
    }

    // Reverse to show most recent first
    months.reverse();

    res.json({ months });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch available months" });
  }
});

export default router;
