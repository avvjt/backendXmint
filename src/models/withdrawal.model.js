import mongoose from "mongoose";

const withdrawalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    wallet: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      required: true,
    },

    asset: {
      type: String,
      enum: ["USDT"],
      default: "USDT",
      required: true,
    },

    network: {
      type: String,
      enum: ["BEP20"],
      default: "BEP20",
      required: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0.00000001,
    },

    destinationAddress: {
      type: String,
      required: true,
      trim: true,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "PROCESSING",
        "COMPLETED",
        "FAILED",
      ],
      default: "PENDING",
      index: true,
    },

    txHash: {
      type: String,
      default: null,
      trim: true,
    },

    failureReason: {
      type: String,
      default: "",
      trim: true,
    },

    processedAt: {
      type: Date,
      default: null,
    },

    completedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const Withdrawal = mongoose.model(
  "Withdrawal",
  withdrawalSchema
);

export default Withdrawal;