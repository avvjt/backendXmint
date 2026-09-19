import mongoose from "mongoose";

const referralBonusSchema = new mongoose.Schema(
  {
    // User receiving the 5% bonus
    referrer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // The user who made the qualifying deposit
    referredUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    // Deposit that triggered the bonus
    deposit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Deposit",
      required: true,
    },

    // Original deposit amount
    depositAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Bonus percentage
    rate: {
      type: Number,
      default: 5,
      min: 0,
    },

    // Bonus amount
    bonusAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
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

const ReferralBonus = mongoose.model(
  "ReferralBonus",
  referralBonusSchema
);

export default ReferralBonus;