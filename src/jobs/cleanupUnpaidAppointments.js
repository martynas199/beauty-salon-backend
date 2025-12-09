import Appointment from "../models/Appointment.js";

/**
 * Deletes appointments with status 'reserved_unpaid' that are older than 8 hours
 */
export async function cleanupUnpaidAppointments() {
  try {
    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);

    const result = await Appointment.deleteMany({
      status: "reserved_unpaid",
      createdAt: { $lt: eightHoursAgo },
    });

    if (result.deletedCount > 0) {
      console.log(
        `[CLEANUP] Deleted ${result.deletedCount} unpaid appointment(s) older than 8 hours`
      );
    }

    return result.deletedCount;
  } catch (error) {
    console.error("[CLEANUP] Error cleaning up unpaid appointments:", error);
    return 0;
  }
}

/**
 * Start the cleanup job that runs every hour
 */
export function startCleanupJob() {
  console.log("[CLEANUP] Starting unpaid appointments cleanup job");

  // Run immediately on startup
  cleanupUnpaidAppointments();

  // Run every hour (3600000 ms)
  const intervalId = setInterval(cleanupUnpaidAppointments, 3600000);

  return intervalId;
}
