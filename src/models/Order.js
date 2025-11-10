import { Schema, model } from "mongoose";

const OrderItemSchema = new Schema(
  {
    productId: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    variantId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    title: {
      type: String,
      required: true,
    },
    size: {
      type: String,
      default: "",
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },
    purchasePrice: {
      type: Number,
      default: null,
      min: 0,
      // Purchase/cost price for profit calculation
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    image: {
      type: String,
      default: "",
    },
    // Stripe Connect: Track which beautician owns this product
    beauticianId: {
      type: Schema.Types.ObjectId,
      ref: "Beautician",
      default: null, // null means platform-owned
    },
  },
  { _id: false }
);

const ShippingAddressSchema = new Schema(
  {
    firstName: {
      type: String,
      required: true,
      trim: true,
    },
    lastName: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    city: {
      type: String,
      required: true,
      trim: true,
    },
    postalCode: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { _id: false }
);

const OrderSchema = new Schema(
  {
    // Link to registered user (optional - null for guest orders)
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      default: null,
    },
    orderNumber: {
      type: String,
      unique: true,
      index: true,
    },
    items: {
      type: [OrderItemSchema],
      required: true,
      validate: {
        validator: function (v) {
          return v.length > 0;
        },
        message: "Order must have at least one item",
      },
    },
    shippingAddress: {
      type: ShippingAddressSchema,
      required: true,
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
    },
    shipping: {
      type: Number,
      default: 0,
      min: 0,
    },
    tax: {
      type: Number,
      default: 0,
      min: 0,
    },
    total: {
      type: Number,
      required: true,
      min: 0,
    },
    paymentMethod: {
      type: String,
      enum: ["card", "paypal", "cash"],
      default: "card",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },
    orderStatus: {
      type: String,
      enum: [
        "pending",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
        "refunded",
      ],
      default: "pending",
    },
    stripePaymentIntentId: {
      type: String,
      default: "",
    },
    // Stripe Connect payment tracking
    stripeConnectPayments: [
      {
        beauticianId: Schema.Types.ObjectId,
        beauticianStripeAccount: String,
        amount: Number, // Amount paid to this beautician
        paymentIntentId: String,
        transferId: String,
        status: {
          type: String,
          enum: ["pending", "succeeded", "failed", "refunded"],
          default: "pending",
        },
      },
    ],
    refundStatus: {
      type: String,
      enum: ["none", "partial", "full"],
      default: "none",
    },
    refundedAt: Date,
    refundReason: String,
    notes: {
      type: String,
      default: "",
      trim: true,
    },
    trackingNumber: {
      type: String,
      default: "",
      trim: true,
    },
    shippedAt: {
      type: Date,
      default: null,
    },
    deliveredAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Generate order number
OrderSchema.pre("save", async function (next) {
  if (!this.orderNumber) {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, "0");
    const random = Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, "0");
    this.orderNumber = `ORD-${year}${month}-${random}`;
  }
  next();
});

// Indexes for efficient queries
OrderSchema.index({ createdAt: -1 }); // Already exists
OrderSchema.index({ "shippingAddress.email": 1 }); // Already exists
OrderSchema.index({ orderStatus: 1 }); // Already exists
OrderSchema.index({ paymentStatus: 1 }); // Already exists
OrderSchema.index({ userId: 1, createdAt: -1 }); // User's orders
OrderSchema.index({ orderStatus: 1, createdAt: -1 }); // Status-filtered orders
OrderSchema.index({ paymentStatus: 1, orderStatus: 1 }); // Combined status
OrderSchema.index({ "items.beauticianId": 1, createdAt: -1 }); // Beautician sales

const Order = model("Order", OrderSchema);

export default Order;
