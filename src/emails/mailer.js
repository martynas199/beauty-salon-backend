import nodemailer from "nodemailer";

/**
 * Format currency based on the currency code
 * @param {number} amount - Amount in main units (e.g., pounds, euros, dollars)
 * @param {string} currency - Currency code (GBP, EUR, USD)
 * @returns {string} Formatted currency string
 */
function formatCurrency(amount, currency = "GBP") {
  const currencyUpper = (currency || "GBP").toUpperCase();

  const symbols = {
    GBP: "£",
    EUR: "€",
    USD: "$",
  };

  const symbol = symbols[currencyUpper] || currencyUpper + " ";
  return `${symbol}${amount.toFixed(2)}`;
}

function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  console.log("[MAILER] Checking SMTP configuration...");
  console.log("[MAILER] SMTP_HOST:", host ? "✓ SET" : "✗ MISSING");
  console.log("[MAILER] SMTP_PORT:", port);
  console.log("[MAILER] SMTP_USER:", user ? "✓ SET" : "✗ MISSING");
  console.log("[MAILER] SMTP_PASS:", pass ? "✓ SET" : "✗ MISSING");

  if (!host || !user || !pass) {
    console.warn("[MAILER] SMTP not fully configured - emails will be skipped");
    return null; // no-op mailer
  }

  console.log("[MAILER] Creating nodemailer transport...");
  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
  console.log("[MAILER] Transport created successfully");
  return transport;
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
  console.log(
    "[MAILER] sendCancellationEmails called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping cancellation emails");
    return;
  }
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  console.log("[MAILER] Sending from:", from);
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
  const currency = policySnapshot?.currency || "GBP";
  const hasRefund = refundAmount && refundAmount > 0;
  const refundAmountFormatted = hasRefund
    ? formatCurrency(refundAmount, currency)
    : null;

  const cust = appointment.client?.email;
  console.log("[MAILER] Customer email:", cust || "NOT SET");
  if (cust) {
    console.log("[MAILER] Preparing cancellation email for customer...");
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
    textContent += `Best regards,\nNoble Elegance`;

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
          <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Noble Elegance</p>
          <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Appointment ID: ${String(
            appointment._id
          )}</p>
        </div>
      </div>
    `;

    console.log("[MAILER] Sending cancellation email to:", cust);
    try {
      const info = await tx.sendMail({
        from,
        to: cust,
        subject: `Appointment Cancelled - ${serviceName}`,
        text: textContent,
        html: htmlContent,
      });
      console.log(
        "[MAILER] ✓ Cancellation email sent successfully. MessageId:",
        info.messageId
      );
    } catch (error) {
      console.error("[MAILER] ✗ Failed to send cancellation email:", error);
      throw error;
    }
  }

  // Optional: Send notification to beautician/salon staff
  const beauticianEmail = process.env.BEAUTICIAN_NOTIFY_EMAIL;
  if (beauticianEmail) {
    const beauticianName = appointment.beauticianId?.name || "Staff";

    await tx.sendMail({
      from,
      to: beauticianEmail,
      subject: `Appointment Cancelled - ${serviceName}`,
      text: `A slot has been freed up.\n\nAppointment Details:\n- Service: ${serviceName}\n- Date & Time: ${startDate}\n- Beautician: ${beauticianName}\n- Client: ${
        appointment.client?.name || "Unknown"
      }\n- Client Email: ${
        appointment.client?.email || "N/A"
      }\n- Client Phone: ${appointment.client?.phone || "N/A"}\n${
        reason && reason.trim() ? `- Cancellation Reason: ${reason}\n` : ""
      }${
        hasRefund ? `- Refund: ${refundAmountFormatted}` : "- Refund: None"
      }\n\nAppointment ID: ${String(appointment._id)}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #f59e0b; border-bottom: 2px solid #f59e0b; padding-bottom: 10px;">📅 Appointment Cancelled - Slot Freed</h2>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
            <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
            <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startDate}</p>
            <p style="margin: 8px 0;"><strong>Beautician:</strong> ${beauticianName}</p>
            ${
              reason && reason.trim()
                ? `<p style="margin: 8px 0;"><strong>Reason:</strong> ${reason}</p>`
                : ""
            }
            ${
              hasRefund
                ? `<p style="margin: 8px 0;"><strong>Refund:</strong> ${refundAmountFormatted}</p>`
                : '<p style="margin: 8px 0;"><strong>Refund:</strong> None</p>'
            }
          </div>
          
          <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
            <h4 style="margin-top: 0; color: #1e40af;">Client Information</h4>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${
              appointment.client?.name || "Unknown"
            }</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> ${
              appointment.client?.email || "N/A"
            }</p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${
              appointment.client?.phone || "N/A"
            }</p>
          </div>
          
          <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${String(
            appointment._id
          )}</p>
        </div>
      `,
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
  console.log(
    "[MAILER] sendConfirmationEmail called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping confirmation email");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  console.log("[MAILER] Sending from:", from);

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
  console.log("[MAILER] Customer email:", customerEmail || "NOT SET");
  if (!customerEmail) {
    console.warn("[MAILER] No customer email - skipping confirmation email");
    return;
  }

  const serviceName = service?.name || appointment.variantName || "Service";
  const beauticianName = beautician?.name || "Our team";
  const currency = appointment.currency || "GBP";
  const price = appointment.price
    ? formatCurrency(appointment.price, currency)
    : "";

  // Determine payment status and deposit info
  let paymentStatus = "Unknown";
  let isDepositPayment = false;
  let depositAmount = 0;
  let bookingFee = 0;
  let remainingBalance = 0;

  // Check if beautician has no-fee subscription active
  const hasNoFeeSubscription =
    beautician?.subscription?.noFeeBookings?.enabled === true &&
    beautician?.subscription?.noFeeBookings?.status === "active";

  // Check if beautician has in-salon payment enabled
  if (beautician?.inSalonPayment) {
    paymentStatus = `Pay in salon (${price} due at appointment)`;
  } else if (appointment.payment?.mode === "pay_in_salon") {
    paymentStatus = "Pay at salon";
  } else if (appointment.payment?.mode === "pay_now") {
    paymentStatus =
      appointment.payment?.status === "succeeded"
        ? "Paid online (Full payment)"
        : "Payment pending";
  } else if (appointment.payment?.mode === "deposit") {
    isDepositPayment = true;
    // Calculate deposit amount from payment.amountTotal (in pence/cents)
    // Note: amountTotal includes the £0.50 booking fee (unless subscription is active)
    const platformFee = hasNoFeeSubscription
      ? 0
      : Number(process.env.STRIPE_PLATFORM_FEE || 50); // in pence/cents
    bookingFee = platformFee / 100; // Convert to main currency unit for display
    const totalPaid = appointment.payment?.amountTotal
      ? appointment.payment.amountTotal / 100
      : 0;
    depositAmount = totalPaid - bookingFee; // Actual deposit without fee

    const totalPrice = Number(appointment.price || 0);
    remainingBalance = totalPrice - depositAmount;

    paymentStatus =
      appointment.payment?.status === "succeeded"
        ? `Deposit paid`
        : "Deposit pending";
  } else if (appointment.status === "reserved_unpaid") {
    paymentStatus = "Pay at salon";
  } else if (appointment.status === "confirmed") {
    paymentStatus = "Confirmed";
  } else {
    paymentStatus = appointment.status;
  }

  console.log("[MAILER] Preparing confirmation email...");
  console.log("[MAILER] Service:", serviceName);
  console.log("[MAILER] Beautician:", beauticianName);
  console.log("[MAILER] Time:", startTime);
  console.log("[MAILER] Appointment status:", appointment.status);
  console.log(
    "[MAILER] Payment object:",
    JSON.stringify(appointment.payment, null, 2)
  );
  console.log("[MAILER] Payment mode:", appointment.payment?.mode);
  console.log("[MAILER] Determined payment status:", paymentStatus);
  console.log("[MAILER] Sending confirmation email to:", customerEmail);

  try {
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `Appointment Confirmed - ${serviceName}`,
      text: `Hi ${appointment.client?.name || ""},

Your appointment has been confirmed!

Service: ${serviceName}
With: ${beauticianName}
Date & Time: ${startTime}
Price: ${price}
${
  isDepositPayment
    ? `Deposit: ${formatCurrency(depositAmount, currency)}${
        bookingFee > 0
          ? `\nBooking Fee: ${formatCurrency(bookingFee, currency)}`
          : ""
      }\nTotal Paid: ${formatCurrency(depositAmount + bookingFee, currency)}`
    : `Payment: ${paymentStatus}`
}${
        isDepositPayment && remainingBalance > 0
          ? `\nRemaining Balance: ${formatCurrency(
              remainingBalance,
              currency
            )} (to be paid at salon)`
          : ""
      }

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
          ${
            isDepositPayment
              ? `
          <div style="background-color: #ecfdf5; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #10b981;">
            <p style="margin: 0 0 8px 0; color: #065f46; font-weight: 600; font-size: 14px;">💳 Payment Details</p>
            <p style="margin: 4px 0; color: #047857; font-size: 14px;">Deposit: <strong>${formatCurrency(
              depositAmount,
              currency
            )}</strong></p>
            ${
              bookingFee > 0
                ? `<p style="margin: 4px 0; color: #047857; font-size: 14px;">Booking Fee: <strong>${formatCurrency(
                    bookingFee,
                    currency
                  )}</strong></p>`
                : ""
            }
            <p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid #d1fae5; color: #065f46; font-size: 15px; font-weight: 700;">Total Paid: ${formatCurrency(
              depositAmount + bookingFee,
              currency
            )}</p>
          </div>
          `
              : `<p style="margin: 8px 0;"><strong>Payment:</strong> ${paymentStatus}</p>`
          }
          ${
            isDepositPayment && remainingBalance > 0
              ? `
          <div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 14px;">💰 Remaining Balance</p>
            <p style="margin: 8px 0 0 0; color: #b45309; font-size: 15px; font-weight: 700;">${formatCurrency(
              remainingBalance,
              currency
            )}</p>
            <p style="margin: 5px 0 0 0; color: #b45309; font-size: 13px;">To be paid at the salon</p>
          </div>
          `
              : ""
          }
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
    console.log(
      "[MAILER] ✓ Confirmation email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send confirmation email:", error);
    throw error;
  }

  // Send notification to beautician
  const beauticianEmail = beautician?.email;
  console.log("[MAILER] Beautician email:", beauticianEmail || "NOT SET");
  if (beauticianEmail) {
    console.log("[MAILER] Preparing beautician notification email...");

    const beauticianTextContent = `Hi ${beauticianName},

You have a new booking!

Service: ${serviceName}
Client: ${appointment.client?.name || "Unknown"}
Date & Time: ${startTime}
Price: ${price}
${
  isDepositPayment
    ? `Deposit: ${formatCurrency(depositAmount, currency)}${
        bookingFee > 0
          ? `\nBooking Fee: ${formatCurrency(bookingFee, currency)}`
          : ""
      }\nTotal Paid: ${formatCurrency(
        depositAmount + bookingFee,
        currency
      )}\nRemaining Balance: ${formatCurrency(
        remainingBalance,
        currency
      )} (to be collected at salon)`
    : `Payment: ${paymentStatus}`
}

Client Contact:
Email: ${appointment.client?.email || "N/A"}
Phone: ${appointment.client?.phone || "N/A"}

${
  appointment.client?.notes
    ? `Client Notes: ${appointment.client.notes}\n\n`
    : ""
}Appointment ID: ${appointment._id}

Please ensure you're prepared for this appointment.`;

    const beauticianHtmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">📅 New Booking Received</h2>
        <p>Hi ${beauticianName},</p>
        <p style="font-size: 16px; color: #374151; font-weight: 600;">You have a new booking!</p>
        
        <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #9333ea;">
          <h3 style="margin-top: 0; color: #1f2937;">Appointment Details</h3>
          <p style="margin: 8px 0;"><strong>Service:</strong> ${serviceName}</p>
          <p style="margin: 8px 0;"><strong>Client:</strong> ${
            appointment.client?.name || "Unknown"
          }</p>
          <p style="margin: 8px 0;"><strong>Date & Time:</strong> ${startTime}</p>
          <p style="margin: 8px 0;"><strong>Price:</strong> ${price}</p>
          ${
            isDepositPayment
              ? `
          <div style="background-color: #ecfdf5; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #10b981;">
            <p style="margin: 0 0 8px 0; color: #065f46; font-weight: 600; font-size: 14px;">💳 Payment Details</p>
            <p style="margin: 4px 0; color: #047857; font-size: 14px;">Deposit: <strong>${formatCurrency(
              depositAmount,
              currency
            )}</strong></p>
            ${
              bookingFee > 0
                ? `<p style="margin: 4px 0; color: #047857; font-size: 14px;">Booking Fee: <strong>${formatCurrency(
                    bookingFee,
                    currency
                  )}</strong></p>`
                : ""
            }
            <p style="margin: 8px 0 0 0; padding-top: 8px; border-top: 1px solid #d1fae5; color: #065f46; font-size: 15px; font-weight: 700;">Total Paid: ${formatCurrency(
              depositAmount + bookingFee,
              currency
            )}</p>
          </div>
          <div style="background-color: #fef3c7; padding: 12px; border-radius: 6px; margin-top: 12px; border-left: 3px solid #f59e0b;">
            <p style="margin: 0; color: #92400e; font-weight: 600; font-size: 14px;">💰 To Collect at Salon</p>
            <p style="margin: 8px 0 0 0; color: #b45309; font-size: 15px; font-weight: 700;">${formatCurrency(
              remainingBalance,
              currency
            )}</p>
          </div>
          `
              : `<p style="margin: 8px 0;"><strong>Payment:</strong> ${paymentStatus}</p>`
          }
        </div>
        
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <h4 style="margin-top: 0; color: #1e40af;">Client Contact</h4>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${
            appointment.client?.email || "N/A"
          }</p>
          <p style="margin: 5px 0;"><strong>Phone:</strong> ${
            appointment.client?.phone || "N/A"
          }</p>
        </div>
        
        ${
          appointment.client?.notes
            ? `
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <h4 style="margin-top: 0; color: #92400e;">📝 Client Notes</h4>
          <p style="margin: 0; color: #b45309;">${appointment.client.notes}</p>
        </div>
        `
            : ""
        }
        
        <p style="margin-top: 30px; color: #374151;">Please ensure you're prepared for this appointment.</p>
        
        <p style="color: #9ca3af; font-size: 11px; margin-top: 30px;">Appointment ID: ${
          appointment._id
        }</p>
      </div>
    `;

    console.log(
      "[MAILER] Sending beautician notification to:",
      beauticianEmail
    );
    try {
      const info = await tx.sendMail({
        from,
        to: beauticianEmail,
        subject: `New Booking - ${serviceName} on ${startTime}`,
        text: beauticianTextContent,
        html: beauticianHtmlContent,
      });
      console.log(
        "[MAILER] ✓ Beautician notification email sent successfully. MessageId:",
        info.messageId
      );
    } catch (error) {
      console.error(
        "[MAILER] ✗ Failed to send beautician notification email:",
        error
      );
      // Don't throw - beautician notification failure shouldn't block the customer confirmation
    }
  }
}

/**
 * Send product order confirmation email to customer
 */
export async function sendOrderConfirmationEmail({ order }) {
  console.log(
    "[MAILER] sendOrderConfirmationEmail called for order:",
    order?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping order confirmation email");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  console.log("[MAILER] Sending from:", from);

  const customerEmail = order.shippingAddress?.email;
  console.log("[MAILER] Customer email:", customerEmail || "NOT SET");
  if (!customerEmail) {
    console.warn("[MAILER] No customer email - skipping order confirmation");
    return;
  }

  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";
  const totalPrice = formatCurrency(order.total || 0, currency);
  const shippingCost = formatCurrency(order.shipping || 0, currency);
  const subtotal = formatCurrency(order.subtotal || 0, currency);

  // Build items list
  const itemsText = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        } - ${formatCurrency((item.price || 0) * item.quantity, currency)}`
    )
    .join("\n");

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${
            item.image
              ? `<img src="${item.image}" alt="${item.title}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" />`
              : ""
          }
          <div>
            <div style="font-weight: 600; color: #1f2937;">${item.title}</div>
            ${
              item.size
                ? `<div style="font-size: 13px; color: #6b7280;">${item.size}</div>`
                : ""
            }
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">
        ${item.quantity}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #1f2937;">
        ${formatCurrency((item.price || 0) * item.quantity, currency)}
      </td>
    </tr>
  `
    )
    .join("");

  const textContent = `Hi ${customerName},

Thank you for your order! We've received your payment and will process your order shortly.

Order Number: ${order.orderNumber}
Order Date: ${new Date(order.createdAt).toLocaleDateString("en-GB")}

ORDER ITEMS:
${itemsText}

Subtotal: ${subtotal}
Shipping: ${shippingCost}
TOTAL: ${totalPrice}

SHIPPING ADDRESS:
${order.shippingAddress.firstName} ${order.shippingAddress.lastName}
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}
Phone: ${order.shippingAddress.phone}

You'll receive another email once your order has been shipped with tracking information.

If you have any questions about your order, please don't hesitate to contact us.

Thank you for shopping with us!

Best regards,
Noble Elegance

Order ID: ${order._id}`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #9333ea; margin: 0;">Order Confirmed! 🎉</h1>
        <p style="color: #6b7280; margin: 10px 0 0 0;">Thank you for your purchase</p>
      </div>
      
      <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0 0 10px 0;"><strong>Hi ${customerName},</strong></p>
        <p style="margin: 0; color: #374151;">Your order has been confirmed and we're getting it ready for shipment.</p>
      </div>
      
      <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin-bottom: 20px; border-left: 4px solid #3b82f6;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
          <span style="color: #1e40af; font-weight: 600;">Order Number:</span>
          <span style="color: #1f2937; font-weight: 700;">${
            order.orderNumber
          }</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #1e40af; font-weight: 600;">Order Date:</span>
          <span style="color: #6b7280;">${new Date(
            order.createdAt
          ).toLocaleDateString("en-GB", {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
          })}</span>
        </div>
      </div>
      
      <h3 style="color: #1f2937; border-bottom: 2px solid #9333ea; padding-bottom: 10px; margin-top: 30px;">Order Items</h3>
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
        <thead>
          <tr style="background-color: #f9fafb;">
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #6b7280; font-size: 13px;">ITEM</th>
            <th style="padding: 12px; text-align: center; font-weight: 600; color: #6b7280; font-size: 13px;">QTY</th>
            <th style="padding: 12px; text-align: right; font-weight: 600; color: #6b7280; font-size: 13px;">PRICE</th>
          </tr>
        </thead>
        <tbody>
          ${itemsHtml}
        </tbody>
      </table>
      
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
          <span style="color: #6b7280;">Subtotal:</span>
          <span style="color: #1f2937;">${subtotal}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb;">
          <span style="color: #6b7280;">Shipping:</span>
          <span style="color: #1f2937;">${shippingCost}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="font-weight: 700; color: #1f2937; font-size: 18px;">Total:</span>
          <span style="font-weight: 700; color: #9333ea; font-size: 18px;">${totalPrice}</span>
        </div>
      </div>
      
      <h3 style="color: #1f2937; border-bottom: 2px solid #9333ea; padding-bottom: 10px; margin-top: 30px;">Shipping Address</h3>
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px; margin-bottom: 20px;">
        <p style="margin: 0; color: #1f2937; font-weight: 600;">${
          order.shippingAddress.firstName
        } ${order.shippingAddress.lastName}</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">${
          order.shippingAddress.address
        }</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">${
          order.shippingAddress.city
        }, ${order.shippingAddress.postalCode}</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">${
          order.shippingAddress.country
        }</p>
        <p style="margin: 10px 0 0 0; color: #6b7280;">📞 ${
          order.shippingAddress.phone
        }</p>
      </div>
      
      <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-weight: 600;">📦 What's Next?</p>
        <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">You'll receive another email once your order has been shipped with tracking information.</p>
      </div>
      
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">If you have any questions about your order, please don't hesitate to contact us.</p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Thank you for shopping with us!</p>
        <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Noble Elegance</p>
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    </div>
  `;

  console.log("[MAILER] Sending order confirmation to:", customerEmail);
  console.log("[MAILER] Order number:", order.orderNumber);
  console.log("[MAILER] Total items:", order.items.length);

  try {
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `Order Confirmed #${order.orderNumber}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Order confirmation email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send order confirmation email:", error);
    throw error;
  }
}

/**
 * Send beautician notification for product orders containing their products
 */
export async function sendBeauticianProductOrderNotification({
  order,
  beautician,
  beauticianItems,
}) {
  console.log(
    "[MAILER] sendBeauticianProductOrderNotification called for order:",
    order?._id,
    "beautician:",
    beautician?.name
  );
  const tx = getTransport();
  if (!tx) {
    console.warn(
      "[MAILER] No transport - skipping beautician product notification"
    );
    return;
  }

  const beauticianEmail = beautician?.email;
  console.log("[MAILER] Beautician email:", beauticianEmail || "NOT SET");
  if (!beauticianEmail) {
    console.warn(
      "[MAILER] No beautician email - skipping beautician product notification"
    );
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";

  // Calculate totals for beautician's items only
  const beauticianTotal = beauticianItems.reduce(
    (sum, item) => sum + (item.price || 0) * item.quantity,
    0
  );
  const beauticianTotalFormatted = formatCurrency(beauticianTotal, currency);

  const itemsList = beauticianItems
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        } - ${formatCurrency((item.price || 0) * item.quantity, currency)}`
    )
    .join("\n");

  const itemsHtml = beauticianItems
    .map(
      (item) => `
    <li style="margin: 8px 0; color: #374151; padding: 12px; background-color: #f9fafb; border-radius: 6px; display: flex; justify-content: space-between; align-items: center;">
      <span>
        <strong>${item.title}</strong>${item.size ? ` (${item.size})` : ""} x ${
        item.quantity
      }
      </span>
      <span style="font-weight: 600; color: #9333ea;">${formatCurrency(
        (item.price || 0) * item.quantity,
        currency
      )}</span>
    </li>`
    )
    .join("");

  const textContent = `Hi ${beautician.name},

Great news! Your products have been ordered! 🎉

Order Number: ${order.orderNumber}
Your Products Total: ${beauticianTotalFormatted}

YOUR PRODUCTS IN THIS ORDER:
${itemsList}

Customer Information:
${customerName}
Email: ${order.shippingAddress.email}
Phone: ${order.shippingAddress.phone}

Shipping Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

The admin will process and fulfill this order. You'll receive your commission once the order is marked as delivered.

Order ID: ${order._id}

Thank you for offering your products on our platform!

Best regards,
Noble Elegance Team`;

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">🎉 Your Products Have Been Ordered!</h2>
      
      <p style="font-size: 16px; color: #374151; margin: 20px 0;">Hi <strong>${
        beautician.name
      }</strong>,</p>
      
      <p style="color: #374151; margin-bottom: 20px;">Great news! A customer has ordered your products from Noble Elegance!</p>
      
      <div style="background-color: #fef3c7; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #fad24e;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
          <span style="color: #92400e; font-weight: 600;">Order Number:</span>
          <span style="font-weight: 700; color: #1f2937; font-family: monospace;">${
            order.orderNumber
          }</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span style="color: #92400e; font-weight: 600;">Your Products Total:</span>
          <span style="font-weight: 700; color: #9333ea; font-size: 18px;">${beauticianTotalFormatted}</span>
        </div>
      </div>
      
      <h3 style="color: #1f2937; margin-top: 30px; margin-bottom: 15px;">Your Products in This Order</h3>
      <ul style="list-style: none; padding: 0; margin: 0 0 20px 0;">
        ${itemsHtml}
      </ul>
      
      <h3 style="color: #1f2937; margin-top: 30px; margin-bottom: 15px;">Customer Information</h3>
      <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; border-left: 4px solid #3b82f6;">
        <p style="margin: 0; font-weight: 600; color: #1f2937;">${customerName}</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">📧 ${
          order.shippingAddress.email
        }</p>
        <p style="margin: 5px 0 0 0; color: #6b7280;">📞 ${
          order.shippingAddress.phone
        }</p>
      </div>
      
      <h3 style="color: #1f2937; margin-top: 25px; margin-bottom: 15px;">Shipping Address</h3>
      <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
        <p style="margin: 0; color: #374151;">${
          order.shippingAddress.address
        }</p>
        <p style="margin: 5px 0 0 0; color: #374151;">${
          order.shippingAddress.city
        }, ${order.shippingAddress.postalCode}</p>
        <p style="margin: 5px 0 0 0; color: #374151;">${
          order.shippingAddress.country
        }</p>
      </div>
      
      <div style="background-color: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
        <p style="margin: 0; color: #065f46; font-weight: 600;">💰 Commission Information</p>
        <p style="margin: 10px 0 0 0; color: #047857; font-size: 14px;">The admin will process and fulfill this order. You'll receive your commission once the order is marked as delivered.</p>
      </div>
      
      <p style="margin-top: 30px; color: #6b7280; font-size: 14px;">Thank you for offering your products on our platform!</p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; color: #6b7280; font-size: 14px;">Best regards,</p>
        <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Noble Elegance Team</p>
        <p style="margin: 20px 0 0 0; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    </div>
  `;

  console.log(
    "[MAILER] Sending beautician product notification to:",
    beauticianEmail
  );
  console.log("[MAILER] Order number:", order.orderNumber);
  console.log("[MAILER] Beautician items count:", beauticianItems.length);
  console.log("[MAILER] Beautician total:", beauticianTotalFormatted);

  try {
    const info = await tx.sendMail({
      from,
      to: beauticianEmail,
      subject: `🎉 Your Products Sold! Order #${order.orderNumber} - ${beauticianTotalFormatted}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Beautician product notification sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error(
      "[MAILER] ✗ Failed to send beautician product notification:",
      error
    );
    // Don't throw - beautician notification failure shouldn't block other emails
  }
}

/**
 * Send admin notification for new product order
 */
export async function sendAdminOrderNotification({ order }) {
  console.log(
    "[MAILER] sendAdminOrderNotification called for order:",
    order?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping admin notification");
    return;
  }

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  console.log("[MAILER] ADMIN_NOTIFY_EMAIL:", adminEmail || "NOT SET");
  if (!adminEmail) {
    console.warn(
      "[MAILER] No admin email configured - skipping admin notification"
    );
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";
  const totalPrice = formatCurrency(
    order.totalPrice || order.total || 0,
    currency
  );

  const itemsList = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        }`
    )
    .join("\n");

  await tx.sendMail({
    from,
    to: adminEmail,
    subject: `🛍️ New Order #${order.orderNumber} - ${totalPrice}`,
    text: `New order received!

Order Number: ${order.orderNumber}
Total: ${totalPrice}
Payment Status: ${order.paymentStatus}

Customer: ${customerName}
Email: ${order.shippingAddress.email}
Phone: ${order.shippingAddress.phone}

Items:
${itemsList}

Shipping Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

Order ID: ${order._id}
View in admin panel to process this order.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">🛍️ New Order Received</h2>
        
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Order Number:</span>
            <span style="font-weight: 700; color: #1f2937;">${
              order.orderNumber
            }</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Total:</span>
            <span style="font-weight: 700; color: #9333ea;">${totalPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600;">Payment:</span>
            <span style="color: #10b981; font-weight: 600;">${
              order.paymentStatus
            }</span>
          </div>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Customer Information</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; font-weight: 600;">${customerName}</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📧 ${
            order.shippingAddress.email
          }</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📞 ${
            order.shippingAddress.phone
          }</p>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Order Items</h3>
        <ul style="background-color: #f9fafb; padding: 15px 15px 15px 35px; border-radius: 8px; margin: 10px 0;">
          ${order.items
            .map(
              (item) =>
                `<li style="margin: 5px 0; color: #374151;">${item.title}${
                  item.size ? ` (${item.size})` : ""
                } x ${item.quantity}</li>`
            )
            .join("")}
        </ul>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Shipping Address</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; color: #374151;">${
            order.shippingAddress.address
          }</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.city
          }, ${order.shippingAddress.postalCode}</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.country
          }</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">⚡ Action Required</p>
          <p style="margin: 10px 0 0 0; color: #b45309; font-size: 14px;">View this order in your admin panel to process and fulfill it.</p>
        </div>
        
        <p style="margin-top: 30px; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    `,
  });

  console.log("[MAILER] Sending admin notification to:", adminEmail);
  console.log("[MAILER] Order number:", order.orderNumber);

  try {
    const info = await tx.sendMail({
      from,
      to: adminEmail,
      subject: `🛍️ New Order #${order.orderNumber} - ${totalPrice}`,
      text: `New order received!

Order Number: ${order.orderNumber}
Total: ${totalPrice}
Payment Status: ${order.paymentStatus}

Customer: ${customerName}
Email: ${order.shippingAddress.email}
Phone: ${order.shippingAddress.phone}

Items:
${itemsList}

Shipping Address:
${order.shippingAddress.address}
${order.shippingAddress.city}, ${order.shippingAddress.postalCode}
${order.shippingAddress.country}

Order ID: ${order._id}
View in admin panel to process this order.`,
      html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #9333ea; border-bottom: 2px solid #9333ea; padding-bottom: 10px;">🛍️ New Order Received</h2>
        
        <div style="background-color: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Order Number:</span>
            <span style="font-weight: 700; color: #1f2937;">${
              order.orderNumber
            }</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
            <span style="font-weight: 600;">Total:</span>
            <span style="font-weight: 700; color: #9333ea;">${totalPrice}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="font-weight: 600;">Payment:</span>
            <span style="color: #10b981; font-weight: 600;">${
              order.paymentStatus
            }</span>
          </div>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Customer Information</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; font-weight: 600;">${customerName}</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📧 ${
            order.shippingAddress.email
          }</p>
          <p style="margin: 5px 0 0 0; color: #6b7280;">📞 ${
            order.shippingAddress.phone
          }</p>
        </div>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Order Items</h3>
        <ul style="background-color: #f9fafb; padding: 15px 15px 15px 35px; border-radius: 8px; margin: 10px 0;">
          ${order.items
            .map(
              (item) =>
                `<li style="margin: 5px 0; color: #374151;">${item.title}${
                  item.size ? ` (${item.size})` : ""
                } x ${item.quantity}</li>`
            )
            .join("")}
        </ul>
        
        <h3 style="color: #1f2937; margin-top: 25px;">Shipping Address</h3>
        <div style="background-color: #f9fafb; padding: 15px; border-radius: 8px;">
          <p style="margin: 0; color: #374151;">${
            order.shippingAddress.address
          }</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.city
          }, ${order.shippingAddress.postalCode}</p>
          <p style="margin: 5px 0 0 0; color: #374151;">${
            order.shippingAddress.country
          }</p>
        </div>
        
        <div style="background-color: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b;">
          <p style="margin: 0; color: #92400e; font-weight: 600;">⚡ Action Required</p>
          <p style="margin: 10px 0 0 0; color: #b45309; font-size: 14px;">View this order in your admin panel to process and fulfill it.</p>
        </div>
        
        <p style="margin-top: 30px; color: #9ca3af; font-size: 11px;">Order ID: ${String(
          order._id
        )}</p>
      </div>
    `,
    });
    console.log(
      "[MAILER] ✓ Admin notification sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send admin notification:", error);
    throw error;
  }
}

/**
 * Send order ready for collection notification to customer
 */
export async function sendOrderReadyForCollectionEmail({ order }) {
  console.log(
    "[MAILER] sendOrderReadyForCollectionEmail called for order:",
    order?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn(
      "[MAILER] No transport - skipping collection ready notification"
    );
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  console.log("[MAILER] Sending from:", from);

  const customerEmail = order.shippingAddress?.email;
  console.log("[MAILER] Customer email:", customerEmail || "NOT SET");
  if (!customerEmail) {
    console.warn(
      "[MAILER] No customer email - skipping collection ready notification"
    );
    return;
  }

  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const currency = order.currency || "GBP";
  const totalPrice = formatCurrency(order.total || 0, currency);

  // Build items list
  const itemsText = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        }`
    )
    .join("\n");

  const itemsHtml = order.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
        <div style="display: flex; align-items: center; gap: 12px;">
          ${
            item.image
              ? `<img src="${item.image}" alt="${item.title}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" />`
              : ""
          }
          <div>
            <div style="font-weight: 600; color: #1f2937;">${item.title}</div>
            ${
              item.size
                ? `<div style="font-size: 13px; color: #6b7280;">${item.size}</div>`
                : ""
            }
          </div>
        </div>
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center; color: #6b7280;">
        ${item.quantity}
      </td>
      <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 600; color: #1f2937;">
        ${formatCurrency((item.price || 0) * item.quantity, currency)}
      </td>
    </tr>
  `
    )
    .join("");

  const collectionAddress =
    order.collectionAddress || "12 Blackfriars Rd, Wisbech PE13 1AT";

  const textContent = `Hi ${customerName},

Great news! Your order is now ready for collection! 🎉

Order Number: ${order.orderNumber}
Total: ${totalPrice}

Items Ready for Collection:
${itemsText}

Collection Address:
${collectionAddress}

Opening Hours:
Monday - Sunday: 9:00 AM - 5:00 PM

Please collect your order during our opening hours. Don't forget to bring your order number: ${order.orderNumber}

If you have any questions, please contact us at +44 7928 775746.

Thank you for shopping with Noble Elegance!

Best regards,
Noble Elegance Team
12 Blackfriars Rd, Wisbech PE13 1AT
Phone: +44 7928 775746`;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #fad24e 0%, #d4a710 100%); padding: 40px 20px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: bold; text-shadow: 0 2px 4px rgba(0,0,0,0.1);">
              🎉 Your Order is Ready!
            </h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 16px; opacity: 0.95;">
              Come and collect it at your convenience
            </p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Hi <strong>${customerName}</strong>,
            </p>
            
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
              Great news! Your order is now ready for collection at Noble Elegance. We've carefully prepared everything for you.
            </p>

            <!-- Order Details Box -->
            <div style="background-color: #fef3c7; border-left: 4px solid #fad24e; padding: 20px; border-radius: 8px; margin-bottom: 30px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                <span style="color: #92400e; font-weight: 600; font-size: 14px;">ORDER NUMBER</span>
                <span style="color: #1f2937; font-weight: 700; font-size: 18px; font-family: monospace;">${
                  order.orderNumber
                }</span>
              </div>
              <div style="display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #92400e; font-weight: 600; font-size: 14px;">TOTAL PAID</span>
                <span style="color: #1f2937; font-weight: 700; font-size: 18px;">${totalPrice}</span>
              </div>
            </div>

            <!-- Items Table -->
            <h2 style="color: #1f2937; font-size: 18px; margin: 0 0 15px 0; font-weight: 600;">
              Your Items
            </h2>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
              <thead>
                <tr style="background-color: #f3f4f6;">
                  <th style="padding: 12px; text-align: left; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Item</th>
                  <th style="padding: 12px; text-align: center; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Qty</th>
                  <th style="padding: 12px; text-align: right; color: #6b7280; font-size: 12px; font-weight: 600; text-transform: uppercase;">Price</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <!-- Collection Address Box -->
            <div style="background-color: #eff6ff; border: 2px solid #93c5fd; border-radius: 12px; padding: 25px; margin-bottom: 30px;">
              <h2 style="color: #1e40af; font-size: 18px; margin: 0 0 15px 0; font-weight: 600;">
                📍 Collection Address
              </h2>
              <p style="color: #1f2937; font-size: 16px; font-weight: 600; margin: 0 0 5px 0; line-height: 1.5;">
                Noble Elegance Beauty Salon
              </p>
              <p style="color: #4b5563; font-size: 15px; margin: 0; line-height: 1.6;">
                ${collectionAddress}
              </p>
              
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #bfdbfe;">
                <h3 style="color: #1e40af; font-size: 15px; margin: 0 0 10px 0; font-weight: 600;">
                  🕒 Opening Hours
                </h3>
                <p style="color: #1f2937; font-size: 14px; margin: 0; line-height: 1.8;">
                  <strong>Monday - Sunday:</strong> 9:00 AM - 5:00 PM
                </p>
              </div>

              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #bfdbfe;">
                <h3 style="color: #1e40af; font-size: 15px; margin: 0 0 10px 0; font-weight: 600;">
                  📞 Contact Us
                </h3>
                <p style="color: #1f2937; font-size: 14px; margin: 0; line-height: 1.8;">
                  Phone: <a href="tel:+447928775746" style="color: #2563eb; text-decoration: none; font-weight: 600;">+44 7928 775746</a>
                </p>
              </div>
            </div>

            <!-- Important Info -->
            <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 15px; border-radius: 8px; margin-bottom: 30px;">
              <p style="color: #991b1b; font-size: 14px; margin: 0; font-weight: 600;">
                ⚠️ Important Reminder
              </p>
              <p style="color: #7f1d1d; font-size: 13px; margin: 8px 0 0 0; line-height: 1.6;">
                Please bring your order number (<strong>${
                  order.orderNumber
                }</strong>) when collecting your items. This helps us serve you quickly and efficiently.
              </p>
            </div>

            <p style="color: #374151; font-size: 15px; line-height: 1.6; margin: 0 0 20px 0;">
              We look forward to seeing you soon! If you have any questions or need to reschedule your collection, please don't hesitate to contact us.
            </p>

            <p style="color: #6b7280; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
              Best regards,<br>
              <strong style="color: #1f2937;">The Noble Elegance Team</strong>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
              Noble Elegance Beauty Salon<br>
              12 Blackfriars Rd, Wisbech PE13 1AT<br>
              Phone: +44 7928 775746
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0 0;">
              Order ID: ${String(order._id)}
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    console.log(
      "[MAILER] Sending collection ready notification to:",
      customerEmail
    );
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `✅ Your Order ${order.orderNumber} is Ready for Collection!`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Collection ready email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error(
      "[MAILER] ✗ Failed to send collection ready notification:",
      error
    );
    throw error;
  }
}

/**
 * Send deposit payment request email for manually created appointments
 */
export async function sendDepositPaymentEmail({
  appointment,
  service,
  beautician,
  depositAmount: depositAmountParam,
  platformFee: platformFeeParam,
  totalAmount: totalAmountParam,
  remainingBalance: remainingBalanceParam,
  hasNoFeeSubscription = false,
}) {
  console.log(
    "[MAILER] sendDepositPaymentEmail called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping deposit payment email");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const customerEmail = appointment.client?.email;

  if (!customerEmail) {
    console.warn("[MAILER] No customer email - skipping deposit payment email");
    return;
  }

  if (!appointment.payment?.checkoutUrl) {
    console.warn("[MAILER] No checkout URL - skipping deposit payment email");
    return;
  }

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

  const serviceName = service?.name || appointment.variantName || "Service";
  const beauticianName = beautician?.name || "Our team";

  // Use passed parameters if available, otherwise fall back to appointment data
  const depositAmount =
    depositAmountParam !== undefined
      ? depositAmountParam.toFixed(2)
      : appointment.payment.amountDeposit
      ? (appointment.payment.amountDeposit / 100).toFixed(2)
      : "0.00";
  const platformFee =
    platformFeeParam !== undefined
      ? platformFeeParam.toFixed(2)
      : appointment.payment.stripe?.platformFee
      ? (appointment.payment.stripe.platformFee / 100).toFixed(2)
      : "0.50";
  const totalAmount =
    totalAmountParam !== undefined
      ? totalAmountParam.toFixed(2)
      : appointment.payment.amountTotal
      ? (appointment.payment.amountTotal / 100).toFixed(2)
      : "0.00";
  const remainingBalance =
    remainingBalanceParam !== undefined
      ? remainingBalanceParam.toFixed(2)
      : appointment.payment.amountBalance
      ? (appointment.payment.amountBalance / 100).toFixed(2)
      : "0.00";

  const textContent = `
Hi ${appointment.client?.name || "there"},

Your appointment for ${serviceName} on ${startTime} has been confirmed with ${beauticianName}.

A deposit is required to secure your appointment slot.

Please click the link below to pay your deposit:
${appointment.payment.checkoutUrl}

Payment breakdown:
- Deposit: £${depositAmount}${
    hasNoFeeSubscription
      ? ""
      : `
- Booking fee: £${platformFee}`
  }
- Total to pay now: £${totalAmount}
- Remaining balance (pay at salon): £${remainingBalance}

Thank you for choosing Noble Elegance Beauty Salon!

Best regards,
Noble Elegance Team
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #76540E 0%, #d4a710 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Deposit Payment Required</h1>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Hi <strong>${appointment.client?.name || "there"}</strong>,
            </p>

            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Your appointment for <strong>${serviceName}</strong> has been confirmed!
            </p>

            <!-- Appointment Details Box -->
            <div style="background-color: #f9fafb; border-left: 4px solid #d4a710; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #111827; font-weight: 600;">📅 Appointment Details</p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Service:</strong> ${serviceName}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Service Price:</strong> £${(
                  Number(depositAmountParam || 0) +
                  Number(remainingBalanceParam || 0)
                ).toFixed(2)}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Beautician:</strong> ${beauticianName}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Date & Time:</strong> ${startTime}
              </p>
            </div>

            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              A deposit is required to secure your appointment slot. Please complete your payment using the button below:
            </p>

            <!-- Payment Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${
                appointment.payment.checkoutUrl
              }" style="display: inline-block; background: #ffffff; color: #059669 !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border: 2px solid #10b981;">
                <span style="color: #059669 !important;">Pay Deposit Now</span>
              </a>
            </div>

            <!-- Payment Breakdown -->
            <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 15px 0; color: #111827; font-weight: 600;">💳 Payment Breakdown</p>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Deposit amount:</td>
                  <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">£${depositAmount}</td>
                </tr>
                ${
                  !hasNoFeeSubscription
                    ? `<tr>
                  <td style="padding: 8px 0; color: #4b5563; font-size: 14px;">Booking fee:</td>
                  <td style="padding: 8px 0; color: #111827; font-size: 14px; text-align: right; font-weight: 600;">£${platformFee}</td>
                </tr>`
                    : ""
                }
                <tr style="border-top: 2px solid #e5e7eb;">
                  <td style="padding: 12px 0 8px 0; color: #111827; font-size: 16px; font-weight: 600;">Total to pay now:</td>
                  <td style="padding: 12px 0 8px 0; color: #d4a710; font-size: 18px; text-align: right; font-weight: 700;">£${totalAmount}</td>
                </tr>
                <tr>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 13px;">Remaining balance (pay at salon):</td>
                  <td style="padding: 8px 0; color: #6b7280; font-size: 13px; text-align: right;">£${remainingBalance}</td>
                </tr>
              </table>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 20px 0 0 0;">
              If you can't click the button, copy and paste this link into your browser:<br>
              <a href="${
                appointment.payment.checkoutUrl
              }" style="color: #d4a710; word-break: break-all;">${
    appointment.payment.checkoutUrl
  }</a>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
              Noble Elegance Beauty Salon<br>
              12 Blackfriars Rd, Wisbech PE13 1AT<br>
              Phone: +44 7928 775746
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0 0;">
              Appointment ID: ${String(appointment._id)}
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    console.log("[MAILER] Sending deposit payment email to:", customerEmail);
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `💳 Deposit Payment Required - ${serviceName}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Deposit payment email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send deposit payment email:", error);
    throw error;
  }
}

/**
 * Send remaining balance payment request email
 */
export async function sendRemainingBalanceEmail({
  appointment,
  service,
  beautician,
  remainingBalance,
  checkoutUrl,
}) {
  console.log(
    "[MAILER] sendRemainingBalanceEmail called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping remaining balance email");
    return;
  }

  const from = process.env.SMTP_FROM || "noreply@yourdomain.com";
  const customerEmail = appointment.client?.email;

  if (!customerEmail) {
    throw new Error("Customer email not found in appointment");
  }

  const serviceName = `${service.name}${
    appointment.variantName ? ` - ${appointment.variantName}` : ""
  }`;
  const beauticianName = beautician.name || "your beautician";
  const startTime = new Date(appointment.start).toLocaleString("en-GB", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const remainingBalanceStr = remainingBalance.toFixed(2);

  const textContent = `
Hi ${appointment.client?.name || "there"},

Your appointment for ${serviceName} on ${startTime} with ${beauticianName} is coming up!

You previously paid a deposit for this appointment. The remaining balance is now due.

Please click the link below to pay the remaining balance:
${checkoutUrl}

Remaining balance to pay: £${remainingBalanceStr}

Thank you for choosing Noble Elegance Beauty Salon!

Best regards,
Noble Elegance Team
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background-color: #d4a710; padding: 40px 30px; text-align: center;">
            <h1 style="color: #1f2937; margin: 0; font-size: 28px; font-weight: 600;">Remaining Balance Due</h1>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Hi <strong>${appointment.client?.name || "there"}</strong>,
            </p>

            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Your appointment for <strong>${serviceName}</strong> is coming up! You previously paid a deposit, and the remaining balance is now due.
            </p>

            <!-- Appointment Details Box -->
            <div style="background-color: #f9fafb; border-left: 4px solid #d4a710; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #111827; font-weight: 600;">📅 Appointment Details</p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Service:</strong> ${serviceName}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Beautician:</strong> ${beauticianName}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Date & Time:</strong> ${startTime}
              </p>
            </div>

            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 20px 0;">
              Please complete your payment using the button below:
            </p>

            <!-- Payment Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${checkoutUrl}" style="display: inline-block; background: #ffffff; color: #059669 !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border: 2px solid #10b981;">
                <span style="color: #059669 !important;">Pay Remaining Balance</span>
              </a>
            </div>

            <!-- Payment Breakdown -->
            <div style="background-color: #f9fafb; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 15px 0; color: #111827; font-weight: 600;">💳 Payment Due</p>
              <div style="text-align: center; padding: 20px 0;">
                <p style="margin: 0 0 8px 0; color: #6b7280; font-size: 14px;">Remaining Balance</p>
                <p style="margin: 0; color: #d4a710; font-size: 32px; font-weight: 700;">£${remainingBalanceStr}</p>
                <p style="margin: 8px 0 0 0; color: #6b7280; font-size: 12px;">No additional fees</p>
              </div>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 20px 0 0 0;">
              If you can't click the button, copy and paste this link into your browser:<br>
              <a href="${checkoutUrl}" style="color: #d4a710; word-break: break-all;">${checkoutUrl}</a>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
              Noble Elegance Beauty Salon<br>
              12 Blackfriars Rd, Wisbech PE13 1AT<br>
              Phone: +44 7928 775746
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0 0;">
              Appointment ID: ${String(appointment._id)}
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    console.log("[MAILER] Sending remaining balance email to:", customerEmail);
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `💰 Remaining Balance Due - ${serviceName}`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Remaining balance email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send remaining balance email:", error);
    throw error;
  }
}

export async function sendBookingFeeEmail({
  appointment,
  service,
  beautician,
  bookingFeeAmount,
  checkoutUrl,
}) {
  console.log(
    "[MAILER] sendBookingFeeEmail called for appointment:",
    appointment?._id
  );
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping booking fee email");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const customerEmail = appointment.client?.email;

  if (!customerEmail) {
    console.warn("[MAILER] No customer email - skipping booking fee email");
    return;
  }

  if (!checkoutUrl) {
    console.warn("[MAILER] No checkout URL - skipping booking fee email");
    return;
  }

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

  const serviceName = service?.name || appointment.variantName || "Service";
  const beauticianName = beautician?.name || "Our team";
  const servicePrice = appointment.price
    ? appointment.price.toFixed(2)
    : "0.00";

  const textContent = `
Hi ${appointment.client?.name || "there"},

Your appointment has been created for ${serviceName} on ${startTime} with ${beauticianName}.

A £${bookingFeeAmount.toFixed(
    2
  )} booking fee is required to confirm your appointment slot.

Please click the link below to pay the booking fee:
${checkoutUrl}

Payment details:
- Service price: £${servicePrice} (to be paid at the salon)
- Booking fee: £${bookingFeeAmount.toFixed(2)}

Once the booking fee is paid, your appointment will be confirmed.

Thank you for choosing Noble Elegance Beauty Salon!

Best regards,
Noble Elegance Team
  `;

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
          <!-- Header -->
          <div style="background: linear-gradient(135deg, #76540E 0%, #d4a710 100%); padding: 40px 30px; text-align: center;">
            <h1 style="color: #ffffff; margin: 0; font-size: 28px; font-weight: 600;">Booking Fee Required</h1>
            <p style="color: #ffffff; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">Confirm Your Appointment</p>
          </div>

          <!-- Content -->
          <div style="padding: 40px 30px;">
            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Hi <strong>${appointment.client?.name || "there"}</strong>,
            </p>

            <p style="color: #374151; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
              Your appointment for <strong>${serviceName}</strong> has been created and is pending confirmation.
            </p>

            <!-- Appointment Details Box -->
            <div style="background-color: #f9fafb; border-left: 4px solid #d4a710; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #111827; font-weight: 600;">📅 Appointment Details</p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Service:</strong> ${serviceName}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Beautician:</strong> ${beauticianName}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Date & Time:</strong> ${startTime}
              </p>
              <p style="margin: 5px 0; color: #4b5563; font-size: 14px;">
                <strong>Service Price:</strong> £${servicePrice} <span style="color: #6b7280; font-size: 12px;">(payable at salon)</span>
              </p>
            </div>

            <!-- Notice Box -->
            <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.6;">
                <strong>⚠️ Action Required:</strong> A £${bookingFeeAmount.toFixed(
                  2
                )} booking fee is required to secure your appointment slot. Your appointment will be confirmed once payment is completed.
              </p>
            </div>

            <!-- Payment Button -->
            <div style="text-align: center; margin: 30px 0;">
              <a href="${checkoutUrl}" style="display: inline-block; background: #ffffff; color: #059669 !important; text-decoration: none; padding: 16px 40px; border-radius: 8px; font-weight: 600; font-size: 16px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); border: 2px solid #10b981;">
                <span style="color: #059669 !important;">Pay Booking Fee (£${bookingFeeAmount.toFixed(
                  2
                )})</span>
              </a>
            </div>

            <!-- What Happens Next -->
            <div style="background-color: #f0fdf4; border-radius: 8px; padding: 20px; margin: 20px 0;">
              <p style="margin: 0 0 10px 0; color: #065f46; font-weight: 600;">✓ What happens next?</p>
              <ul style="margin: 0; padding-left: 20px; color: #047857; font-size: 14px; line-height: 1.8;">
                <li>Pay the £${bookingFeeAmount.toFixed(
                  2
                )} booking fee using the button above</li>
                <li>Your appointment will be automatically confirmed</li>
                <li>You'll receive a confirmation email</li>
                <li>Pay the remaining £${servicePrice} at the salon</li>
              </ul>
            </div>

            <p style="color: #6b7280; font-size: 13px; line-height: 1.6; margin: 20px 0 0 0;">
              If you can't click the button, copy and paste this link into your browser:<br>
              <a href="${checkoutUrl}" style="color: #d4a710; word-break: break-all;">${checkoutUrl}</a>
            </p>
          </div>

          <!-- Footer -->
          <div style="background-color: #f9fafb; padding: 30px; text-align: center; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 13px; margin: 0 0 10px 0;">
              Noble Elegance Beauty Salon<br>
              12 Blackfriars Rd, Wisbech PE13 1AT<br>
              Phone: +44 7928 775746
            </p>
            <p style="color: #9ca3af; font-size: 11px; margin: 15px 0 0 0;">
              Appointment ID: ${String(appointment._id)}
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  try {
    console.log("[MAILER] Sending booking fee email to:", customerEmail);
    const info = await tx.sendMail({
      from,
      to: customerEmail,
      subject: `💳 Booking Fee Required - Confirm Your ${serviceName} Appointment`,
      text: textContent,
      html: htmlContent,
    });
    console.log(
      "[MAILER] ✓ Booking fee email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send booking fee email:", error);
    throw error;
  }
}

export default {
  sendCancellationEmails,
  sendConfirmationEmail,
  sendDepositPaymentEmail,
  sendBookingFeeEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
  sendBeauticianProductOrderNotification,
  sendOrderReadyForCollectionEmail,
};
