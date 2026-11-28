
import mongoose from "mongoose";
import Deposit from "../models/deposit.model.js";
import Wallet from "../models/wallet.model.js";

const DEPOSIT_ADDRESS =
  process.env.BSC_DEPOSIT_ADDRESS ||
  "0x6331421329FB4D7b17742c22feF0f388EAe4a3ED";

export const submitManualDeposit = async (req, res) => {
  try {
    const userId = req.user?.id;
    const amount = Number(req.body?.amount);
    const txHash = String(req.body?.txHash || "").trim().toLowerCase();

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    if (!Number.isFinite(amount) || amount < 50 || amount > 1_000_000_000) {
      return res.status(400).json({
        success: false,
        message: "Minimum deposit is 50 USDT.",
      });
    }

    // Accept USDT amounts with up to 6 decimal places.
    if (Math.abs(amount * 1_000_000 - Math.round(amount * 1_000_000)) > 0.0001) {
      return res.status(400).json({
        success: false,
        message: "Amount supports up to 6 decimal places.",
      });
    }

    if (!/^0x[a-f0-9]{64}$/.test(txHash)) {
      return res.status(400).json({
        success: false,
        message: "Enter a valid transaction hash.",
      });
    }

    // A transaction hash can only be submitted once across all users.
    const existingDeposit = await Deposit.findOne({ txHash }).lean();

    if (existingDeposit) {
      return res.status(409).json({
        success: false,
        message: "This transaction hash has already been submitted.",
      });
    }

    const wallet = await Wallet.findOne({ user: userId });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "User wallet not found.",
      });
    }

    // Never trust the asset, network, or recipient sent by the client.
    const deposit = await Deposit.create({
      user: userId,
      wallet: wallet._id,
      asset: "USDT",
      network: "BEP20",
      depositAddress: DEPOSIT_ADDRESS,
      amount,
      txHash,
      status: "PENDING",
      confirmations: 0,
      submittedAt: new Date(),
    });

    return res.status(201).json({
      success: true,
      message: "Deposit submitted for review.",
      deposit: {
        id: deposit._id,
        amount: deposit.amount,
        txHash: deposit.txHash,
        asset: deposit.asset,
        network: deposit.network,
        status: deposit.status,
        submittedAt: deposit.submittedAt,
      },
    });
  } catch (error) {
    // Also handles duplicate submissions racing against the unique index.
    if (error?.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "This transaction hash has already been submitted.",
      });
    }

    console.error("Manual deposit submission failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to submit deposit. Please try again.",
    });
  }
};


// ==========================================
// GET LOGGED-IN USER'S DEPOSIT HISTORY
// ==========================================

export const getMyDeposits = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId || !mongoose.isValidObjectId(userId)) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    const deposits = await Deposit.find({
      user: userId,
    })
      .select(
        "paymentMethod asset network amount inrAmount exchangeRate utr txHash status rejectionReason submittedAt createdAt confirmedAt"
      )
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      deposits,
    });
  } catch (error) {
    console.error("User deposit history error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to fetch deposit history.",
    });
  }
};
