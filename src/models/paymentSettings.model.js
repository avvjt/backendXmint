
import mongoose from "mongoose";

const paymentSettingsSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      default: "upi",
      unique: true,
      required: true,
    },

    upiId: {
      type: String,
      required: true,
      trim: true,
    },

    payeeName: {
      type: String,
      required: true,
      trim: true,
    },

    qrImage: {
      url: {
        type: String,
        default: null,
      },
      publicId: {
        type: String,
        default: null,
      },
    },

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

const PaymentSettings = mongoose.model(
  "PaymentSettings",
  paymentSettingsSchema
);

export default PaymentSettings;
