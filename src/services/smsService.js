import axios from "axios";

/**
 * Get SMS API URL from environment or fallback
 */
function getSmsApiUrl() {
  return process.env.SMS_API_URL || "http://localhost:3001";
}

/**
 * Send SMS via Raspberry Pi SMS gateway
 */
async function sendSMS(phone, message) {
  const SMS_API_URL = getSmsApiUrl();

  console.log("[SMS] Attempting to send SMS");
  console.log("[SMS] API URL:", SMS_API_URL);
  console.log("[SMS] Phone:", phone);
  console.log("[SMS] Message:", message);

  if (!phone) {
    console.error("[SMS] ✗ No phone number provided");
    return {
      success: false,
      error: "No phone number provided",
    };
  }

  try {
    console.log("[SMS] Making request to SMS gateway...");
    const response = await axios.post(
      `${SMS_API_URL}/send-sms`,
      {
        phone,
        message,
      },
      {
        timeout: 10000, // 10 second timeout
      }
    );

    console.log("[SMS] ✓ SMS sent successfully:", response.data);
    return {
      success: true,
      data: response.data,
    };
  } catch (error) {
    console.error("[SMS] ✗ Failed:", error.message);
    if (error.response) {
      console.error("[SMS] Response status:", error.response.status);
      console.error("[SMS] Response data:", error.response.data);
    } else if (error.request) {
      console.error("[SMS] No response received. Gateway may be down.");
    } else {
      console.error("[SMS] Request setup error:", error.message);
    }
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send booking confirmation SMS
 */
async function sendBookingConfirmation(appointment) {
  console.log("[SMS] sendBookingConfirmation called");
  console.log("[SMS] Appointment data:", JSON.stringify(appointment, null, 2));

  // Get service name
  let serviceName = "your service";
  if (appointment.serviceName) {
    serviceName = appointment.serviceName;
  } else if (appointment.service?.name) {
    serviceName = appointment.service.name;
  } else if (appointment.serviceId?.name) {
    serviceName = appointment.serviceId.name;
  }

  // Get beautician name
  const beauticianName =
    appointment.beauticianName ||
    appointment.beautician?.name ||
    appointment.beauticianId?.name ||
    "our team";

  // Get client phone
  const phone =
    appointment.clientPhone || appointment.client?.phone || appointment.phone;

  console.log("[SMS] Extracted service name:", serviceName);
  console.log("[SMS] Extracted beautician name:", beauticianName);
  console.log("[SMS] Extracted phone:", phone);

  // Extract time - handle both Date objects and time strings
  let time = appointment.startTime || appointment.time || "your scheduled time";
  let dateObj = appointment.date || appointment.start;

  // If we have a Date object for the appointment start, extract the time from it
  if (dateObj && typeof dateObj !== "string") {
    try {
      const startDate = new Date(dateObj);
      if (!isNaN(startDate.getTime())) {
        // Extract time if not already provided as a string
        if (!appointment.startTime && !appointment.time) {
          time = startDate.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
          });
        }
      }
    } catch (err) {
      console.error("[SMS] Time extraction error:", err);
    }
  }

  // Format date properly
  let dateStr = "your appointment date";
  if (dateObj) {
    try {
      const date = new Date(dateObj);
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString("en-GB", {
          weekday: "short",
          day: "numeric",
          month: "short",
          year: "numeric",
        });
      }
    } catch (err) {
      console.error("[SMS] Date parsing error:", err);
    }
  }

  const message = `Booking Confirmed! ${serviceName} with ${beauticianName} on ${dateStr} at ${time}. Thank you!`;
  console.log("[SMS] Final message:", message);

  return sendSMS(phone, message);
}

/**
 * Send booking reminder SMS (24 hours before)
 */
async function sendBookingReminder(appointment) {
  const serviceName =
    appointment.serviceName ||
    appointment.service?.name ||
    appointment.serviceId?.name ||
    "your service";

  const beauticianName =
    appointment.beauticianName ||
    appointment.beautician?.name ||
    appointment.beauticianId?.name ||
    "our team";

  const phone =
    appointment.clientPhone || appointment.client?.phone || appointment.phone;

  const time =
    appointment.startTime || appointment.time || "your scheduled time";

  const message = `Reminder: Your appointment for ${serviceName} with ${beauticianName} is tomorrow at ${time}. See you then!`;

  return sendSMS(phone, message);
}

/**
 * Send booking cancellation SMS
 */
async function sendBookingCancellation(appointment) {
  const serviceName =
    appointment.serviceName ||
    appointment.service?.name ||
    appointment.serviceId?.name ||
    "your service";

  const phone =
    appointment.clientPhone || appointment.client?.phone || appointment.phone;

  let dateStr = "your appointment date";
  const dateObj = appointment.date || appointment.start;
  if (dateObj) {
    try {
      const date = new Date(dateObj);
      if (!isNaN(date.getTime())) {
        dateStr = date.toLocaleDateString("en-GB");
      }
    } catch (err) {
      console.error("[SMS] Date parsing error:", err);
    }
  }

  const message = `Your booking for ${serviceName} on ${dateStr} has been cancelled. Contact us if you have questions.`;

  return sendSMS(phone, message);
}

/**
 * Send booking rescheduled SMS
 */
async function sendBookingRescheduled(appointment, oldDate, oldTime) {
  const serviceName =
    appointment.serviceName ||
    appointment.service?.name ||
    appointment.serviceId?.name ||
    "your service";

  const phone =
    appointment.clientPhone || appointment.client?.phone || appointment.phone;

  const newDate = new Date(appointment.date || appointment.start);
  const oldDateObj = new Date(oldDate);

  const message = `Booking Rescheduled! From ${oldDateObj.toLocaleDateString(
    "en-GB"
  )} ${oldTime} to ${newDate.toLocaleDateString("en-GB")} ${
    appointment.startTime || appointment.time
  }. ${serviceName}.`;

  return sendSMS(phone, message);
}

export default {
  sendSMS,
  sendBookingConfirmation,
  sendBookingReminder,
  sendBookingCancellation,
  sendBookingRescheduled,
};
