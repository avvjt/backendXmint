import mongoose from "mongoose";

const walletCounterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      unique: true,
      required: true,
    },

    nextIndex: {
      type: Number,
      default: 0,
      min: 0,
    },
  },
  { timestamps: true }
);

const WalletCounter = mongoose.model(
  "WalletCounter",
  walletCounterSchema
);

export default WalletCounter;