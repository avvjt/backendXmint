import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: ["MANUAL", "AUTO"],
      required: true,
    },

    date: {
      type: String,
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: ["COMPLETED", "FAILED"],
      default: "COMPLETED",
      index: true,
    },

    reference: {
      type: String,
      default: null,
      trim: true,
    },

    completedAt: {
      type: Date,
      default: Date.now,
    },
    
  },
  {
    timestamps: true,
  }
);
tradeSchema.index(
  { user: 1, date: 1 },
  { unique: true }
);
const Trade = mongoose.model("Trade", tradeSchema);

export default Trade;