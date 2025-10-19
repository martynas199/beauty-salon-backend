import nodemailer from "nodemailer";

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) {
    return null; // no-op mailer
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

/**
 * Send simple cancellation emails to customer and beautician. No-op if SMTP not configured.
 */
export async function sendCancellationEmails({
  appointment,
  policySnapshot,
  refundAmount,
  outcomeStatus,
}) {
  const tx = getTransport();
  if (!tx) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const salonTz = process.env.SALON_TZ || "Europe/London";
  const when = new Date(appointment.start).toLocaleString("en-GB", {
    timeZone: salonTz,
  });
  const ref = String(appointment._id);
  const refundText =
    refundAmount > 0
      ? `Refund: ${(refundAmount / 100).toFixed(2)} ${
          policySnapshot?.currency || "GBP"
        }`
      : `No refund due.`;
  const outcome = outcomeStatus.replace(/_/g, " ");

  const cust = appointment.client?.email;
  if (cust) {
    await tx.sendMail({
      from,
      to: cust,
      subject: `Your appointment ${ref} has been cancelled`,
      text: `Hi ${
        appointment.client?.name || ""
      },\n\nYour appointment on ${when} was cancelled.\nOutcome: ${outcome}. ${refundText}.\nBanks can take a few days to process refunds.\n\nThanks`,
    });
  }
  const beauticianEmail = process.env.BEAUTICIAN_NOTIFY_EMAIL; // optional
  if (beauticianEmail) {
    await tx.sendMail({
      from,
      to: beauticianEmail,
      subject: `Slot freed: appointment ${ref} cancelled`,
      text: `Appointment ${ref} for ${when} cancelled. Client: ${
        appointment.client?.name || ""
      } ${appointment.client?.email || ""}.`,
    });
  }
}

/**
 * Send appointment confirmation email to customer
 */
export async function sendConfirmationEmail({
  appointment,
  service,
  beautician,
}) {
  const tx = getTransport();
  if (!tx) return;

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const salonTz = process.env.SALON_TZ || "Europe/London";
  const startTime = new Date(appointment.start).toLocaleString("en-GB", {
    timeZone: salonTz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const customerEmail = appointment.client?.email;
  if (!customerEmail) return;

  const serviceName = service?.name || appointment.variantName || "Service";
  const beauticianName = beautician?.name || "Our team";
  const price = appointment.price
    ? `£${Number(appointment.price).toFixed(2)}`
    : "";
  const paymentStatus =
    appointment.status === "confirmed"
      ? "Paid"
      : appointment.status === "reserved_unpaid"
      ? "Pay at salon"
      : appointment.status;

  await tx.sendMail({
    from,
    to: customerEmail,
    subject: `Appointment Confirmed - ${serviceName}`,
    text: `Hi ${appointment.client?.name || ""},

Your appointment has been confirmed!

Service: ${serviceName}
With: ${beauticianName}
Date & Time: ${startTime}
Price: ${price}
Payment: ${paymentStatus}

${
  appointment.client?.notes ? `Your notes: ${appointment.client.notes}\n\n` : ""
}We look forward to seeing you!

If you need to cancel or reschedule, please contact us as soon as possible.

Appointment ID: ${appointment._id}

Thank you for choosing us!`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #9333ea;">Appointment Confirmed ✓</h2>
        <p>Hi ${appointment.client?.name || ""},</p>
        <p>Your appointment has been confirmed!</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>With:</strong> ${beauticianName}</p>
          <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startTime}</p>
          <p style="margin: 8px 0;"><strong>Price:</strong> ${price}</p>
          <p style="margin: 8px 0;"><strong>Payment:</strong> ${paymentStatus}</p>
        </div>
        
        ${
          appointment.client?.notes
            ? `<p><em>Your notes: ${appointment.client.notes}</em></p>`
            : ""
        }
        
        <p>We look forward to seeing you!</p>
        <p style="color: #6b7280; font-size: 12px;">If you need to cancel or reschedule, please contact us as soon as possible.</p>
        <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${
          appointment._id
        }</p>
      </div>
    `,
  });
}

export default { sendCancellationEmails, sendConfirmationEmail };
