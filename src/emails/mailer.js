import nodemailer from "nodemailer";

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
    console.warn(
      "[MAILER] SMTP not fully configured - emails will be skipped"
    );
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
  const currency = policySnapshot?.currency?.toUpperCase() || "GBP";
  const hasRefund = refundAmount && refundAmount > 0;
  const refundAmountFormatted = hasRefund
    ? `£${(refundAmount / 100).toFixed(2)}`
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
  const price = appointment.price
    ? `£${Number(appointment.price).toFixed(2)}`
    : "";
  const paymentStatus =
    appointment.status === "confirmed"
      ? "Paid"
      : appointment.status === "reserved_unpaid"
      ? "Pay at salon"
      : appointment.status;

  console.log("[MAILER] Preparing confirmation email...");
  console.log("[MAILER] Service:", serviceName);
  console.log("[MAILER] Beautician:", beauticianName);
  console.log("[MAILER] Time:", startTime);
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
    console.log(
      "[MAILER] ✓ Confirmation email sent successfully. MessageId:",
      info.messageId
    );
  } catch (error) {
    console.error("[MAILER] ✗ Failed to send confirmation email:", error);
    throw error;
  }
}

/**
 * Send product order confirmation email to customer
 */
export async function sendOrderConfirmationEmail({ order }) {
  console.log("[MAILER] sendOrderConfirmationEmail called for order:", order?._id);
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
  const totalPrice = `£${(order.totalPrice / 100).toFixed(2)}`;
  const shippingCost = `£${(order.shippingCost / 100).toFixed(2)}`;
  const subtotal = `£${((order.totalPrice - order.shippingCost) / 100).toFixed(
    2
  )}`;

  // Build items list
  const itemsText = order.items
    .map(
      (item) =>
        `- ${item.title}${item.size ? ` (${item.size})` : ""} x ${
          item.quantity
        } - £${((item.price * item.quantity) / 100).toFixed(2)}`
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
        £${((item.price * item.quantity) / 100).toFixed(2)}
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
Beauty Salon Team

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
        <p style="margin: 5px 0 0 0; color: #9333ea; font-weight: bold;">Beauty Salon Team</p>
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
 * Send admin notification for new product order
 */
export async function sendAdminOrderNotification({ order }) {
  console.log("[MAILER] sendAdminOrderNotification called for order:", order?._id);
  const tx = getTransport();
  if (!tx) {
    console.warn("[MAILER] No transport - skipping admin notification");
    return;
  }

  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;
  console.log("[MAILER] ADMIN_NOTIFY_EMAIL:", adminEmail || "NOT SET");
  if (!adminEmail) {
    console.warn("[MAILER] No admin email configured - skipping admin notification");
    return;
  }

  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const customerName = `${order.shippingAddress.firstName} ${order.shippingAddress.lastName}`;
  const totalPrice = `£${(order.totalPrice / 100).toFixed(2)}`;

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
            <span style="font-weight: 700; color: #1f2937;">${order.orderNumber}</span>
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

export default {
  sendCancellationEmails,
  sendConfirmationEmail,
  sendOrderConfirmationEmail,
  sendAdminOrderNotification,
};
