import mongoose from "mongoose";

const dailyEarningSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    userPackage: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UserPackage",
      required: true,
      index: true,
    },

    date: {
      type: String,
      required: true,
    },

    baseAmount: {
      type: Number,
      required: true,
      min: 0,
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
      required: true,
    },

    dailyRate: {
      type: Number,
      required: true,
      min: 0,
    },

    earningAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    tradeType: {
      type: String,
      enum: ["MANUAL", "AUTO"],
      required: true,
    },

    tradeReference: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },

    status: {
      type: String,
      enum: ["COMPLETED", "FAILED"],
      default: "COMPLETED",
      index: true,
    },

    creditedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// One user can receive only ONE daily earning
// for a particular calendar date.
dailyEarningSchema.index(
  { user: 1, date: 1 },
  { unique: true }
);

const DailyEarning = mongoose.model(
  "DailyEarning",
  dailyEarningSchema
);

export default DailyEarning;