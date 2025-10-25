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
 * Send cancellation emails to customer and beautician. No-op if SMTP not configured.
 */
export async function sendCancellationEmails({
  appointment,
  policySnapshot,
  refundAmount,
  outcomeStatus,
  reason,
}) {
  const tx = getTransport();
  if (!tx) return;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const salonTz = process.env.SALON_TZ || "Europe/London";

  const startDate = new Date(appointment.start).toLocaleString("en-GB", {
    timeZone: salonTz,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const serviceName =
    appointment.serviceId?.name || appointment.variantName || "Service";
  const currency = policySnapshot?.currency?.toUpperCase() || "GBP";
  const hasRefund = refundAmount && refundAmount > 0;
  const refundAmountFormatted = hasRefund
    ? `£${(refundAmount / 100).toFixed(2)}`
    : null;

  const cust = appointment.client?.email;
  if (cust) {
    // Build email content conditionally
    let textContent = `Hi ${appointment.client?.name || ""},\n\n`;
    textContent += `Your appointment has been cancelled.\n\n`;
    textContent += `Appointment Details:\n`;
    textContent += `- Service: ${serviceName}\n`;
    textContent += `- Date & Time: ${startDate}\n`;

    if (reason && reason.trim()) {
      textContent += `- Reason: ${reason}\n`;
    }

    textContent += `\n`;

    if (hasRefund) {
      textContent += `A refund of ${refundAmountFormatted} has been processed to your original payment method.\n`;
      textContent += `Please allow 5-10 business days for the refund to appear in your account, depending on your bank.\n\n`;
    } else {
      textContent += `No refund is applicable for this cancellation.\n\n`;
    }

    textContent += `If you have any questions, please don't hesitate to contact us.\n\n`;
    textContent += `We hope to see you again soon!\n\n`;
    textContent += `Best regards,\nBeauty Salon Team`;

    // HTML version
    let htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #ef4444; border-bottom: 2px solid #ef4444; padding-bottom: 10px;">Appointment Cancelled</h2>
        <p>Hi ${appointment.client?.name || ""},</p>
        <p>Your appointment has been cancelled.</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444;">
          <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startDate}</p>
          ${
            reason && reason.trim()
              ? `<p style="margin: 8px 0;"><strong>Reason:</strong> ${reason}</p>`
              : ""
          }
        </div>
        
        ${
          hasRefund
            ? `
        <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
          <p style="margin: 0; color: #065f46;"><strong>💰 Refund Information</strong></p>
          <p style="margin: 10px 0 0 0; color: #047857;">A refund of <strong>${refundAmountFormatted}</strong> has been processed to your original payment method.</p>
          <p style="margin: 10px 0 0 0; font-size: 13px; color: #059669;">Please allow 5-10 business days for the refund to appear in your account, depending on your bank.</p>
        </div>
        `
            : `
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e;">No refund is applicable for this cancellation.</p>
        </div>
        `
        }
        
        <p style="margin-top: 30px;">If you have any questions, please don't hesitate to contact us.</p>
        <p>We hope to see you again soon!</p>
        
        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
          <p style="margin: 0; color: #6b7280; font-size: 14px;">Best regards,</p>
          <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Beauty Salon Team</p>
          <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Appointment ID: ${String(
            appointment._id
          )}</p>
        </div>
      </div>
    `;

    await tx.sendMail({
      from,
      to: cust,
      subject: `Appointment Cancelled - ${serviceName}`,
      text: textContent,
      html: htmlContent,
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
