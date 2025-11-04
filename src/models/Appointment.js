import mongoose from "mongoose";

const PaymentStripeSchema = new mongoose.Schema(
  {
    paymentIntentId: String,
    chargeId: String,
    refundIds: [String],
    // Stripe Connect fields
    platformFee: { type: Number, default: 50 }, // £0.50 in pence
    beauticianStripeAccount: String, // Connected account ID
    transferId: String, // ID of the transfer to beautician
  },
  { _id: false }
);

const PaymentSchema = new mongoose.Schema(
  {
    mode: {
      type: String,
      enum: ["pay_now", "deposit", "pay_in_salon"],
      index: true,
    },
    provider: {
      type: String,
      enum: ["stripe", "cash", "pos"],
      default: "stripe",
    },
    status: {
      type: String,
      enum: [
        "succeeded",
        "requires_action",
        "refunded",
        "partial_refunded",
        "unpaid",
      ],
      default: "unpaid",
    },
    sessionId: String,
    amountTotal: { type: Number, default: 0 },
    amountDeposit: { type: Number },
    amountBalance: { type: Number },
    stripe: { type: PaymentStripeSchema, default: undefined },
  },
  { _id: false }
);

const AuditSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    action: String,
    by: String,
    meta: mongoose.Schema.Types.Mixed,
  },
  { _id: false }
);

const AppointmentSchema = new mongoose.Schema(
  {
    // Link to registered user (optional - null for guest bookings)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    client: { name: String, email: String, phone: String, notes: String },
    beauticianId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Beautician",
      index: true,
    },
    serviceId: { type: mongoose.Schema.Types.ObjectId, ref: "Service" },
    variantName: String,
    start: Date,
    end: Date,
    price: Number,
    status: {
      type: String,
      enum: [
        "reserved_unpaid",
        "confirmed",
        "completed",
        "cancelled_no_refund",
        "cancelled_partial_refund",
        "cancelled_full_refund",
        "no_show",
      ],
      default: "confirmed",
      index: true,
    },
    cancelledAt: Date,
    cancelReason: String,
    cancelledBy: { type: String, enum: ["customer", "staff", "system"] },
    payment: { type: PaymentSchema, default: undefined },
    audit: { type: [AuditSchema], default: [] },
    policySnapshot: mongoose.Schema.Types.Mixed,
  },
  { timestamps: true }
);

AppointmentSchema.index({ beauticianId: 1, start: 1 });
export default mongoose.model("Appointment", AppointmentSchema);
