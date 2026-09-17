import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    // -------------------------
    // Authentication
    // -------------------------
    email: {
      type: String,
      required: true,
      unique: true,
      match: [
        /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
        "Please provide a valid email",
      ],
      trim: true,
      lowercase: true,
    },

    password: {
      type: String,
      minlength: 8,
    },

    googleId: {
      type: String,
      default: null,
    },

    provider: {
      type: String,
      enum: ["local", "google"],
      default: "local",
    },

    // -------------------------
    // Profile
    // -------------------------
    fullName: {
      type: String,
      trim: true,
      default: "",
    },

    username: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },

    phone: {
      type: String,
      trim: true,
      default: "",
    },

    avatarUrl: {
      type: String,
      default: "",
    },

    // -------------------------
    // Referral / Team
    // -------------------------
    referralCode: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
    },

    referredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },

    teamLevel: {
      type: Number,
      min: 1,
      max: 6,
      default: 1,
    },

    // -------------------------
    // Account
    // -------------------------
    accountStatus: {
      type: String,
      enum: [
        "PENDING",
        "CONFIRMING",
        "ACTIVE",
        "SUSPENDED",
      ],
      default: "PENDING",
      index: true,
    },

    activatedAt: {
      type: Date,
      default: null,
    },

    // -------------------------
    // Password reset
    // -------------------------
    resetPasswordToken: {
      type: String,
    },

    resetPasswordExpire: {
      type: Date,
    },
    role: {
      type: String,
      enum: ["USER", "ADMIN"],
      default: "USER",
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;