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
      enum: [
        "PROCESSING",
        "COMPLETED",
        "FAILED",
      ],
      default: "COMPLETED",
      index: true,
    },

    reference: {
      type: String,
      default: null,
      trim: true,
    },

    /*
     * ============================================================
     * AUTO TRADE PROCESSING
     * ============================================================
     */

    processingUntil: {
      type: Date,
      default: null,
      index: true,
    },

    /*
     * Exact wallet amount locked when
     * Auto Trade started.
     */
    lockedAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    /*
     * 24-hour Auto Trade cooldown.
     */
    cooldownUntil: {
      type: Date,
      default: null,
      index: true,
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

/*
|--------------------------------------------------------------------------
| INDEXES
|--------------------------------------------------------------------------
|
| IMPORTANT:
| We intentionally DO NOT keep the old unique
| { user: 1, date: 1 } index.
|
| Auto Trade is now controlled by a 24-hour
| cooldown, not by calendar date.
|
*/

tradeSchema.index({
  user: 1,
  date: 1,
});

tradeSchema.index({
  user: 1,
  type: 1,
  status: 1,
  createdAt: -1,
});

tradeSchema.index({
  user: 1,
  cooldownUntil: 1,
});

const Trade = mongoose.model(
  "Trade",
  tradeSchema
);

export default Trade;