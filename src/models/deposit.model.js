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

    // Payment method
    paymentMethod: {
      type: String,
      enum: ["BEP20", "UPI"],
      default: "BEP20",
      required: true,
      index: true,
    },

    asset: {
      type: String,
      enum: ["USDT"],
      default: "USDT",
      required: true,
    },

    network: {
      type: String,
      enum: ["BEP20", "UPI"],
      default: "BEP20",
      required: true,
    },

    // Required only for BEP20 deposits.
    depositAddress: {
      type: String,
      trim: true,
      lowercase: true,
      default: null,
    },

    // Always represents the USDT amount to credit.
    amount: {
      type: Number,
      required: true,
      min: 0.000001,
    },

    // BEP20 transaction hash.
    txHash: {
      type: String,
      trim: true,
      lowercase: true,
      default: undefined,
    },

    // UPI deposit information.
    inrAmount: {
      type: Number,
      min: 1000,
      default: null,
    },

    exchangeRate: {
      type: Number,
      min: 0,
      default: null,
    },

    rateSource: {
      type: String,
      default: null,
      trim: true,
    },

    rateFetchedAt: {
      type: Date,
      default: null,
    },

    utr: {
      type: String,
      trim: true,
      uppercase: true,
      default: undefined,
    },

    paymentScreenshot: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
    },

    // Snapshot of the UPI payment destination.
    paymentDetails: {
      upiId: {
        type: String,
        default: null,
      },
      payeeName: {
        type: String,
        default: null,
      },
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

    // Existing blockchain verification fields.
    verifiedAmount: {
      type: Number,
      min: 0,
      default: null,
    },

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

// Only index actual blockchain transaction hashes.
// UPI deposits don't have transaction hashes.
depositSchema.index(
  { txHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      txHash: { $type: "string" },
    },
  }
);

// Prevent the same UTR from being submitted by multiple users.
depositSchema.index(
  { utr: 1 },
  {
    unique: true,
    partialFilterExpression: {
      utr: { $type: "string" },
    },
  }
);

const Deposit = mongoose.model("Deposit", depositSchema);

export default Deposit;
