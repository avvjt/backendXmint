import mongoose from "mongoose";

const userPackageSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    packageKey: {
      type: String,
      enum: [
        "STARTER",
        "PRO",
        "MASTER",
        "ELITE",
        "EMPIRE",
      ],
      default: null,
    },

    packageName: {
      type: String,
      default: null,
      trim: true,
    },

    baseAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    dailyRate: {
      type: Number,
      default: 0,
      min: 0,
    },

    isActive: {
      type: Boolean,
      default: false,
      index: true,
    },

    lastEarningDate: {
      type: String,
      default: null,
    },

    lastTradeDate: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const UserPackage = mongoose.model(
  "UserPackage",
  userPackageSchema
);

export default UserPackage;