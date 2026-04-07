import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import nodemailer from "nodemailer";
import Location from "../src/models/Location.js";
import { sendConfirmationEmail } from "../src/emails/mailer.js";

const ENV_KEYS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_FROM",
  "SALON_TZ",
  "STRIPE_PLATFORM_FEE",
];

function captureEnv() {
  const snapshot = {};
  for (const key of ENV_KEYS) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot) {
  for (const key of ENV_KEYS) {
    if (snapshot[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = snapshot[key];
    }
  }
}

function formatStartTime(dateInput) {
  return new Date(dateInput).toLocaleString("en-GB", {
    timeZone: process.env.SALON_TZ || "Europe/London",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

describe("Mailer: sendConfirmationEmail", () => {
  let envSnapshot;
  let sentMails;
  let originalCreateTransport;
  let originalFindById;

  beforeEach(() => {
    envSnapshot = captureEnv();
    process.env.SMTP_HOST = "smtp.test.local";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "noreply@test.local";
    process.env.SMTP_PASS = "test-password";
    process.env.SMTP_FROM = "booking@test.local";
    process.env.SALON_TZ = "Europe/London";
    process.env.STRIPE_PLATFORM_FEE = "50";

    sentMails = [];
    originalCreateTransport = nodemailer.createTransport;
    originalFindById = Location.findById;

    nodemailer.createTransport = () => ({
      sendMail: async (mailOptions) => {
        sentMails.push(mailOptions);
        return { messageId: `test-${sentMails.length}` };
      },
    });
  });

  afterEach(() => {
    nodemailer.createTransport = originalCreateTransport;
    Location.findById = originalFindById;
    restoreEnv(envSnapshot);
  });

  it("includes full appointment details in customer and beautician emails", async () => {
    Location.findById = () => {
      throw new Error("Location.findById should not be called for populated location objects");
    };

    const appointment = {
      _id: "appt-123",
      start: "2026-05-01T09:30:00.000Z",
      variantName: "Permanent Make-Up Brows - Touch up 4-8 weeks",
      price: 120,
      currency: "GBP",
      status: "confirmed",
      payment: {
        mode: "deposit",
        status: "succeeded",
        amountTotal: 3050,
      },
      locationId: {
        name: "Peterborough",
        address: {
          street: "1 Bridge Street",
          city: "Peterborough",
          postcode: "PE1 1AA",
          country: "United Kingdom",
        },
      },
      client: {
        name: "Svetlana Pavlova",
        email: "svetlana@example.com",
        phone: "+447000111222",
        notes: "Please ring the bell on arrival",
      },
    };

    const service = {
      name: "Permanent Make-Up Brows - Touch up 4-8 weeks",
    };

    const beautician = {
      name: "Justina",
      email: "justina@example.com",
      subscription: {
        noFeeBookings: {
          enabled: false,
          status: "inactive",
        },
      },
    };

    const expectedStartTime = formatStartTime(appointment.start);
    const expectedLocation =
      "Peterborough (1 Bridge Street, Peterborough, PE1 1AA, United Kingdom)";

    await sendConfirmationEmail({ appointment, service, beautician });

    assert.equal(sentMails.length, 2, "expected customer and beautician emails");

    const customerMail = sentMails.find((mail) => mail.to === appointment.client.email);
    const beauticianMail = sentMails.find((mail) => mail.to === beautician.email);

    assert.ok(customerMail, "customer email should be sent");
    assert.ok(beauticianMail, "beautician email should be sent");

    assert.ok(customerMail.subject.includes(service.name));
    assert.ok(customerMail.text.includes(`Service: ${service.name}`));
    assert.ok(customerMail.text.includes(`With: ${beautician.name}`));
    assert.ok(customerMail.text.includes(`Date & Time: ${expectedStartTime}`));
    assert.ok(customerMail.text.includes(`Location: ${expectedLocation}`));
    assert.ok(customerMail.text.includes("Price:"));
    assert.ok(customerMail.text.includes("120.00"));
    assert.ok(customerMail.text.includes("Deposit:"));
    assert.ok(customerMail.text.includes("Booking Fee:"));
    assert.ok(customerMail.text.includes("Total Paid:"));
    assert.ok(customerMail.text.includes("Remaining Balance:"));
    assert.ok(customerMail.text.includes(`Your notes: ${appointment.client.notes}`));
    assert.ok(customerMail.text.includes(`Appointment ID: ${appointment._id}`));
    assert.ok(customerMail.html.includes(`<strong>Service:</strong> ${service.name}`));
    assert.ok(customerMail.html.includes(`<strong>With:</strong> ${beautician.name}`));
    assert.ok(customerMail.html.includes(`<strong>Date & Time:</strong> ${expectedStartTime}`));
    assert.ok(customerMail.html.includes(`<strong>Location:</strong> ${expectedLocation}`));
    assert.ok(customerMail.html.includes(`<strong>Price:</strong>`));
    assert.ok(customerMail.html.includes("120.00"));
    assert.ok(customerMail.html.includes("Deposit:"));
    assert.ok(customerMail.html.includes("Booking Fee:"));
    assert.ok(customerMail.html.includes("Total Paid:"));
    assert.ok(customerMail.html.includes("Remaining Balance"));
    assert.ok(customerMail.html.includes(`Your notes: ${appointment.client.notes}`));
    assert.ok(customerMail.html.includes(`Appointment ID: ${appointment._id}`));

    assert.ok(beauticianMail.subject.includes("New Booking"));
    assert.ok(beauticianMail.text.includes(`Service: ${service.name}`));
    assert.ok(beauticianMail.text.includes(`Client: ${appointment.client.name}`));
    assert.ok(beauticianMail.text.includes(`Date & Time: ${expectedStartTime}`));
    assert.ok(beauticianMail.text.includes(`Location: ${expectedLocation}`));
    assert.ok(beauticianMail.text.includes("Price:"));
    assert.ok(beauticianMail.text.includes("120.00"));
    assert.ok(beauticianMail.text.includes("Deposit:"));
    assert.ok(beauticianMail.text.includes("Booking Fee:"));
    assert.ok(beauticianMail.text.includes("Total Paid:"));
    assert.ok(beauticianMail.text.includes("Remaining Balance:"));
    assert.ok(beauticianMail.text.includes("Client Contact:"));
    assert.ok(beauticianMail.text.includes(`Email: ${appointment.client.email}`));
    assert.ok(beauticianMail.text.includes(`Phone: ${appointment.client.phone}`));
    assert.ok(beauticianMail.text.includes(`Client Notes: ${appointment.client.notes}`));
    assert.ok(beauticianMail.text.includes(`Appointment ID: ${appointment._id}`));
    assert.ok(beauticianMail.html.includes(`<strong>Service:</strong> ${service.name}`));
    assert.ok(beauticianMail.html.includes(`<strong>Client:</strong> ${appointment.client.name}`));
    assert.ok(beauticianMail.html.includes(`<strong>Date & Time:</strong> ${expectedStartTime}`));
    assert.ok(beauticianMail.html.includes(`<strong>Location:</strong> ${expectedLocation}`));
    assert.ok(beauticianMail.html.includes(`<strong>Price:</strong>`));
    assert.ok(beauticianMail.html.includes("120.00"));
    assert.ok(beauticianMail.html.includes("Deposit:"));
    assert.ok(beauticianMail.html.includes("Booking Fee:"));
    assert.ok(beauticianMail.html.includes("Total Paid:"));
    assert.ok(beauticianMail.html.includes("To Collect at Salon"));
    assert.ok(beauticianMail.html.includes("Client Contact"));
    assert.ok(beauticianMail.html.includes(`<strong>Email:</strong> ${appointment.client.email}`));
    assert.ok(beauticianMail.html.includes(`<strong>Phone:</strong> ${appointment.client.phone}`));
    assert.ok(beauticianMail.html.includes(appointment.client.notes));
    assert.ok(beauticianMail.html.includes(`Appointment ID: ${appointment._id}`));
  });

  it("resolves location by locationId and includes it in both emails", async () => {
    let findByIdCalls = 0;
    const locationId = "loc-123";
    const locationDoc = {
      name: "Wisbeach",
      address: {
        street: "10 High Street",
        city: "Wisbeach",
        postcode: "PE13 1AB",
        country: "United Kingdom",
      },
    };

    Location.findById = (value) => {
      findByIdCalls += 1;
      assert.equal(value, locationId);
      return {
        select: (fields) => {
          assert.equal(fields, "name address");
          return {
            lean: async () => locationDoc,
          };
        },
      };
    };

    const appointment = {
      _id: "appt-456",
      start: "2026-05-08T10:30:00.000Z",
      variantName: "Brow Lamination",
      price: 75,
      currency: "GBP",
      status: "confirmed",
      payment: {
        mode: "pay_now",
        status: "succeeded",
      },
      locationId,
      client: {
        name: "Maria Smith",
        email: "maria@example.com",
        phone: "+447000000000",
      },
    };

    const service = { name: "Brow Lamination" };
    const beautician = { name: "Justina", email: "justina@example.com" };
    const expectedLocation =
      "Wisbeach (10 High Street, Wisbeach, PE13 1AB, United Kingdom)";

    await sendConfirmationEmail({ appointment, service, beautician });

    assert.equal(findByIdCalls, 1, "location should be resolved from database");
    assert.equal(sentMails.length, 2);

    const customerMail = sentMails.find((mail) => mail.to === appointment.client.email);
    const beauticianMail = sentMails.find((mail) => mail.to === beautician.email);

    assert.ok(customerMail);
    assert.ok(beauticianMail);
    assert.ok(customerMail.text.includes(`Location: ${expectedLocation}`));
    assert.ok(beauticianMail.text.includes(`Location: ${expectedLocation}`));
    assert.ok(customerMail.html.includes(`<strong>Location:</strong> ${expectedLocation}`));
    assert.ok(beauticianMail.html.includes(`<strong>Location:</strong> ${expectedLocation}`));
  });
});
