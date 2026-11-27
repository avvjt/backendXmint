
import mongoose from "mongoose";

import Deposit from "../models/deposit.model.js";
import Wallet from "../models/wallet.model.js";

import { getUsdtInrRate } from "../services/exchangeRate.service.js";
import { uploadBufferToCloudinary } from "../services/cloudinaryUpload.service.js";

import cloudinary from "../config/cloudinary.js";

const MINIMUM_INR_DEPOSIT = 1000;

// GET /api/deposits/upi/config
export const getUpiDepositConfig = async (req, res) => {
  try {
    const upiId = process.env.UPI_ID;
    const payeeName = process.env.UPI_PAYEE_NAME;

    if (!upiId || !payeeName) {
      return res.status(503).json({
        success: false,
        message: "UPI payment details are not configured.",
      });
    }

    const quote = await getUsdtInrRate();

    return res.json({
      success: true,
      paymentDetails: {
        upiId,
        payeeName,
      },
      exchangeRate: quote.rate,
      currency: "INR",
      asset: "USDT",
      minimumDeposit: MINIMUM_INR_DEPOSIT,
      rateSource: quote.source,
      rateFetchedAt: quote.fetchedAt,
    });
  } catch (error) {
    console.error("UPI configuration fetch failed:", error);

    return res.status(503).json({
      success: false,
      message: "Unable to fetch current payment details or exchange rate.",
    });
  }
};

// POST /api/deposits/upi
export const submitUpiDeposit = async (req, res) => {
  let uploadedAsset = null;

  try {
    const userId = req.user?.id;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const inrAmount = Number(req.body?.inrAmount);
    const utr = String(req.body?.utr || "")
      .trim()
      .toUpperCase();

    if (
      !Number.isFinite(inrAmount) ||
      inrAmount < MINIMUM_INR_DEPOSIT ||
      inrAmount > 10000000
    ) {
      return res.status(400).json({
        success: false,
        message: "Minimum UPI deposit is ₹1,000.",
      });
    }

    if (
      Math.abs(inrAmount * 100 - Math.round(inrAmount * 100)) >
      0.0001
    ) {
      return res.status(400).json({
        success: false,
        message: "INR amount supports up to 2 decimal places.",
      });
    }

    if (!/^[A-Z0-9]{8,30}$/.test(utr)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid UPI transaction reference (UTR).",
      });
    }

    if (!req.file?.buffer) {
      return res.status(400).json({
        success: false,
        message: "Payment screenshot is required.",
      });
    }

    const upiId = process.env.UPI_ID;
    const payeeName = process.env.UPI_PAYEE_NAME;

    if (!upiId || !payeeName) {
      return res.status(503).json({
        success: false,
        message: "UPI payment details are not configured.",
      });
    }

    // Prevent already-submitted UTRs.
    const existingDeposit = await Deposit.findOne({ utr }).lean();

    if (existingDeposit) {
      return res.status(409).json({
        success: false,
        message: "This UPI transaction reference has already been submitted.",
      });
    }

    const wallet = await Wallet.findOne({
      user: userId,
      asset: "USDT",
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "User wallet not found.",
      });
    }

    // Fetch the current market quote.
    const quote = await getUsdtInrRate();

    // Calculate USDT on the backend, never trust frontend calculations.
    const usdtAmount = Number(
      (inrAmount / quote.rate).toFixed(6)
    );

    if (!Number.isFinite(usdtAmount) || usdtAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Unable to calculate the USDT deposit amount.",
      });
    }

    // Upload payment proof to Cloudinary.
    uploadedAsset = await uploadBufferToCloudinary(
      req.file.buffer
    );

    // Save the request. No wallet credit happens here.
    const deposit = await Deposit.create({
      user: userId,
      wallet: wallet._id,

      paymentMethod: "UPI",
      asset: "USDT",
      network: "UPI",

      amount: usdtAmount,
      inrAmount,

      exchangeRate: quote.rate,
      rateSource: quote.source,
      rateFetchedAt: quote.fetchedAt,

      utr,

      paymentScreenshot: {
        url: uploadedAsset.url,
        publicId: uploadedAsset.publicId,
      },

      paymentDetails: {
        upiId,
        payeeName,
      },

      status: "PENDING",
      submittedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "UPI deposit submitted for manual verification.",
      deposit: {
        id: deposit._id,
        inrAmount: deposit.inrAmount,
        amount: deposit.amount,
        exchangeRate: deposit.exchangeRate,
        utr: deposit.utr,
        status: deposit.status,
        submittedAt: deposit.submittedAt,
      },
    });
  } catch (error) {
    // Clean up the uploaded screenshot if database creation fails.
    if (uploadedAsset?.publicId) {
      try {
        await cloudinary.uploader.destroy(
          uploadedAsset.publicId,
          { resource_type: "image" }
        );
      } catch (cleanupError) {
        console.error("Cloudinary cleanup failed:", cleanupError);
      }
    }

    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This UPI transaction reference has already been submitted.",
      });
    }

    console.error("UPI deposit submission failed:", error);

    return res.status(503).json({
      success: false,
      message: "Unable to submit UPI deposit. Please try again.",
    });
  }
};
