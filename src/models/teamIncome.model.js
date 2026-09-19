import mongoose from "mongoose";

const teamIncomeSchema = new mongoose.Schema(
  {
    // User receiving the commission
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // User whose earning generated this commission
    sourceUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    // A, B or C relationship
    teamLevel: {
      type: String,
      enum: ["A", "B", "C"],
      required: true,
    },

    // Original earning of the team member
    sourceAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    // Commission percentage applied
    rate: {
      type: Number,
      required: true,
      min: 0,
    },

    // Actual commission earned
    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    // What generated this commission
    type: {
      type: String,
      enum: ["TEAM_COMMISSION", "REFERRAL_BONUS"],
      required: true,
      index: true,
    },

    // Reference to the earning/deposit/event that generated it
    referenceId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },

    // Transaction identifier when applicable
    txHash: {
      type: String,
      default: null,
      trim: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "COMPLETED", "FAILED"],
      default: "COMPLETED",
      index: true,
    },

    description: {
      type: String,
      default: "",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

const TeamIncome = mongoose.model(
  "TeamIncome",
  teamIncomeSchema
);

export default TeamIncome;