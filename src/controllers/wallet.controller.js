import Wallet from "../models/wallet.model.js";
import User from "../models/user.model.js";
import Deposit from "../models/deposit.model.js";
import Transaction from "../models/transaction.model.js";
import createWalletForUser from "../utils/createWallet.js";

import Wallet from "../models/wallet.model.js";
import Trade from "../models/trade.model.js";

// GET /api/wallet
export const getWallet = async (req, res) => {
  try {
    const userId = req.user._id;

    let wallet = await Wallet.findOne({ user: userId });

    // Create wallet if it doesn't exist
    if (!wallet) {
      wallet = await Wallet.create({
        user: userId,
        asset: "USDT",
        network: "BEP20",
        availableBalance: 0,
        lockedBalance: 0,
      });
    }

    const now = new Date();

    // --------------------------------------------------
    // Find currently processing Auto Trade
    // --------------------------------------------------
    const processingTrade = await Trade.findOne({
      user: userId,
      type: "AUTO",
      status: "PROCESSING",
    })
      .sort({ createdAt: -1 })
      .lean();

    // --------------------------------------------------
    // Find latest completed Auto Trade
    // --------------------------------------------------
    const lastAutoTrade = await Trade.findOne({
      user: userId,
      type: "AUTO",
      status: "COMPLETED",
    })
      .sort({ completedAt: -1 })
      .lean();

    const processingUntil = processingTrade?.processingUntil || null;

    let cooldownUntil = null;

    if (
      !processingTrade &&
      lastAutoTrade?.cooldownUntil &&
      new Date(lastAutoTrade.cooldownUntil) > now
    ) {
      cooldownUntil = lastAutoTrade.cooldownUntil;
    }

    const isProcessing = Boolean(processingTrade);
    const isCooldown = Boolean(cooldownUntil);

    const availableBalance = Number(wallet.availableBalance || 0);
    const lockedBalance = Number(wallet.lockedBalance || 0);

    // --------------------------------------------------
    // Determine Auto Trade state
    // --------------------------------------------------
    let autoTradeStatus = "AVAILABLE";

    if (isProcessing) {
      autoTradeStatus = "PROCESSING";
    } else if (isCooldown) {
      autoTradeStatus = "COOLDOWN";
    } else if (availableBalance <= 0) {
      autoTradeStatus = "NO_BALANCE";
    }

    const canAutoTrade =
      !isProcessing &&
      !isCooldown &&
      availableBalance > 0;

    return res.status(200).json({
      success: true,

      wallet: {
        id: wallet._id,
        asset: wallet.asset,
        network: wallet.network,
        depositAddress: wallet.depositAddress,

        availableBalance,
        lockedBalance,

        totalBalance: availableBalance + lockedBalance,

        // Auto Trade state
        processingUntil,
        cooldownUntil,

        autoTrade: {
          status: autoTradeStatus,
          canAutoTrade,
          processingUntil,
          cooldownUntil,
        },
      },
    });
  } catch (error) {
    console.error("Get wallet error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch wallet",
    });
  }
};

const getDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find({
      user: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      deposits,
    });
  } catch (error) {
    console.error("Get deposits error:", error);

    return res.status(500).json({
      message: "Failed to fetch deposits",
    });
  }
};

const getTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({
      user: req.user.id,
    })
      .sort({ createdAt: -1 })
      .limit(50);

    return res.status(200).json({
      success: true,
      transactions,
    });
  } catch (error) {
    console.error("Get transactions error:", error);

    return res.status(500).json({
      message: "Failed to fetch transactions",
    });
  }
};

export { getWallet, getDeposits, getTransactions };