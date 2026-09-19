import Trade from "../models/trade.model.js";
import { processDailyEarning } from "../services/dailyEarning.service.js";

const getTodayString = () => {
  return new Date().toISOString().slice(0, 10);
};

const createManualTrade = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = getTodayString();

    const existingTrade = await Trade.findOne({
      user: userId,
      date: today,
      status: "COMPLETED",
    });

    if (existingTrade) {
      return res.status(400).json({
        success: false,
        message: "You have already completed today's trade.",
      });
    }

    const trade = await Trade.create({
      user: userId,
      type: "MANUAL",
      date: today,
      status: "COMPLETED",
      completedAt: new Date(),
    });

    try {
      const earning = await processDailyEarning({
        userId,
        tradeId: trade._id,
      });

      return res.status(201).json({
        success: true,
        message: "Trade completed and daily return credited.",
        trade,
        earning,
      });
    } catch (error) {
      // Don't leave a fake successful trade if earning failed
      await Trade.findByIdAndDelete(trade._id);

      throw error;
    }
  } catch (error) {
    console.error("Manual trade error:", error);

    if (error.message === "DAILY_EARNING_ALREADY_CLAIMED") {
      return res.status(400).json({
        success: false,
        message: "Today's earning has already been claimed.",
      });
    }

    if (error.message === "NO_ELIGIBLE_PACKAGE") {
      return res.status(400).json({
        success: false,
        message: "You do not have an eligible package.",
      });
    }

    if (error.message === "WALLET_NOT_FOUND") {
      return res.status(404).json({
        success: false,
        message: "Wallet not found.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Failed to complete trade.",
    });
  }
};

export { createManualTrade };