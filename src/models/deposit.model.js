import mongoose from "mongoose";

const depositSchema = new mongoose.Schema(
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

    depositAddress: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },

    txHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    status: {
      type: String,
      enum: ["PENDING", "CONFIRMED", "FAILED"],
      default: "PENDING",
      index: true,
    },

    confirmations: {
      type: Number,
      default: 0,
      min: 0,
    },

    confirmedAt: {
      type: Date,
      default: null,
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

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;