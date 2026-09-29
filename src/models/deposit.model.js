
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
      lowercase: true,
      index: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 50,
    },

    txHash: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "UNDER_REVIEW",
        "CONFIRMED",
        "REJECTED",
        "FAILED",
      ],
      default: "PENDING",
      index: true,
    },

    confirmations: {
      type: Number,
      default: 0,
      min: 0,
    },

    submittedAt: {
      type: Date,
      default: Date.now,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 500,
      default: null,
    },

    confirmedAt: {
      type: Date,
      default: null,
    },

    creditedAt: {
      type: Date,
      default: null,
    },

    // Stores the verified on-chain amount separately
    // from the amount submitted by the user.
    verifiedAmount: {
      type: Number,
      min: 0,
      default: null,
    },

    // Set only after successful backend transaction verification.
    verificationData: {
      blockNumber: {
        type: Number,
        default: null,
      },
      tokenContract: {
        type: String,
        trim: true,
        lowercase: true,
        default: null,
      },
      fromAddress: {
        type: String,
        trim: true,
        lowercase: true,
        default: null,
      },
      verifiedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;