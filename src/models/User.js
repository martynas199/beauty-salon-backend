import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: {
      type: String,
      trim: true,
    },
    password: {
      type: String,
      required: function () {
        // Password only required if not using OAuth
        return !this.googleId && !this.appleId;
      },
      minlength: 6,
    },
    // OAuth provider IDs
    googleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    appleId: {
      type: String,
      sparse: true,
      unique: true,
    },
    // OAuth provider metadata
    authProvider: {
      type: String,
      enum: ["local", "google", "apple"],
      default: "local",
    },
    // Virtual references to bookings and orders
    // We'll populate these via userId field in Appointment/Order models
    role: {
      type: String,
      enum: ["customer"],
      default: "customer",
    },
    // Track user statistics
    totalBookings: {
      type: Number,
      default: 0,
    },
    totalOrders: {
      type: Number,
      default: 0,
    },
    totalSpent: {
      type: Number,
      default: 0,
    },
    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLogin: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for faster lookups (email already has unique index from schema)
// Add composite indexes if needed in the future
// userSchema.index({ email: 1, authProvider: 1 });

// Method to exclude password when converting to JSON
userSchema.methods.toJSON = function () {
  const user = this.toObject();
  delete user.password;
  return user;
};

const User = mongoose.model("User", userSchema);

export default User;
