
import PaymentSettings from "../models/paymentSettings.model.js";

// ==========================================
// GET UPI PAYMENT SETTINGS
// ==========================================

export const getUpiSettings = async (req, res) => {
  try {
    const settings = await PaymentSettings.findOne({
      key: "upi",
    }).lean();

    return res.status(200).json({
      success: true,
      settings: settings || {
        upiId: "",
        payeeName: "",
        qrImage: {
          url: null,
          publicId: null,
        },
        isActive: false,
      },
    });
  } catch (error) {
    console.error("Get UPI settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch UPI settings",
    });
  }
};

// ==========================================
// UPDATE UPI PAYMENT SETTINGS
// ==========================================

export const updateUpiSettings = async (req, res) => {
  try {
    const { upiId, payeeName, isActive } = req.body;

    if (
      typeof upiId !== "string" ||
      !upiId.trim() ||
      typeof payeeName !== "string" ||
      !payeeName.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "UPI ID and payee name are required",
      });
    }

    const normalizedUpiId = upiId.trim();

    // Basic UPI ID validation
    if (!/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+$/.test(normalizedUpiId)) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid UPI ID",
      });
    }

    const settings = await PaymentSettings.findOneAndUpdate(
      { key: "upi" },
      {
        $set: {
          upiId: normalizedUpiId,
          payeeName: payeeName.trim(),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
        },
        $setOnInsert: {
          key: "upi",
        },
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true,
      }
    );

    return res.status(200).json({
      success: true,
      message: "UPI settings updated successfully",
      settings,
    });
  } catch (error) {
    console.error("Update UPI settings error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to update UPI settings",
    });
  }
};
      
