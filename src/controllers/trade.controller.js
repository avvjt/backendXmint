import Trade from "../models/trade.model.js";
import { processDailyEarning } from "../services/dailyEarning.service.js";

const getTodayString = () => {
  return new Date().toISOString().slice(0, 10);
};

/*
|--------------------------------------------------------------------------
| CREATE TRADE
|--------------------------------------------------------------------------
*/

const createTrade = async ({
  userId,
  type,
}) => {
  const today = getTodayString();

  /*
   * Trade has a unique index on:
   *
   * { user: 1, date: 1 }
   *
   * Therefore only one completed trade can exist
   * for a user on a given day.
   */

  const existingTrade = await Trade.findOne({
    user: userId,
    date: today,
  });

  if (existingTrade) {
    throw new Error("DAILY_TRADE_ALREADY_COMPLETED");
  }

  let trade;

  try {
    trade = await Trade.create({
      user: userId,
      type,
      date: today,
      status: "COMPLETED",
      completedAt: new Date(),
    });
  } catch (error) {
    /*
     * Another request may have created today's trade
     * between the findOne() and create().
     */
    if (error?.code === 11000) {
      throw new Error("DAILY_TRADE_ALREADY_COMPLETED");
    }

    throw error;
  }

  try {
    const earning = await processDailyEarning({
      userId,
      tradeId: trade._id,
    });

    return {
      trade,
      earning,
    };
  } catch (error) {
    /*
     * Remove the trade if the earning transaction failed.
     *
     * This prevents a failed earning from leaving
     * behind a completed trade.
     */
    await Trade.findByIdAndDelete(trade._id);

    throw error;
  }
};

/*
|--------------------------------------------------------------------------
| MANUAL TRADE
|--------------------------------------------------------------------------
*/

const createManualTrade = async (req, res) => {
  try {
    const result = await createTrade({
      userId: req.user.id,
      type: "MANUAL",
    });

    return res.status(201).json({
      success: true,
      message:
        "Trade completed and daily return credited.",
      trade: result.trade,
      earning: result.earning,
    });
  } catch (error) {
    console.error("Manual trade error:", error);

    return handleTradeError(res, error);
  }
};

/*
|--------------------------------------------------------------------------
| AUTO TRADE
|--------------------------------------------------------------------------
*/

const createAutoTrade = async (req, res) => {
  try {
    const result = await createTrade({
      userId: req.user.id,
      type: "AUTO",
    });

    return res.status(201).json({
      success: true,
      message:
        "Auto Trade completed and daily return credited.",
      trade: result.trade,
      earning: result.earning,
    });
  } catch (error) {
    console.error("Auto trade error:", error);

    return handleTradeError(res, error);
  }
};

/*
|--------------------------------------------------------------------------
| TRADE HISTORY
|--------------------------------------------------------------------------
*/

const getTradeHistory = async (req, res) => {
  try {
    const trades = await Trade.find({
      user: req.user.id,
    })
      .sort({
        createdAt: -1,
      })
      .limit(50)
      .lean();

    return res.status(200).json({
      success: true,
      trades,
    });
  } catch (error) {
    console.error("Trade history error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load trade history.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

const handleTradeError = (res, error) => {
  switch (error.message) {
    case "DAILY_TRADE_ALREADY_COMPLETED":
      return res.status(400).json({
        success: false,
        message:
          "You have already completed today's trade.",
      });

    case "DAILY_EARNING_ALREADY_CLAIMED":
      return res.status(400).json({
        success: false,
        message:
          "Today's earning has already been claimed.",
      });

    case "NO_ELIGIBLE_PACKAGE":
      return res.status(400).json({
        success: false,
        message:
          "Your wallet balance does not match an eligible package.",
      });

    case "WALLET_NOT_FOUND":
      return res.status(404).json({
        success: false,
        message: "Wallet not found.",
      });

    case "VALID_TODAY_TRADE_NOT_FOUND":
      return res.status(400).json({
        success: false,
        message:
          "Valid today's trade could not be found.",
      });

    case "INVALID_EARNING_AMOUNT":
      return res.status(400).json({
        success: false,
        message:
          "Unable to calculate today's earning.",
      });

    default:
      return res.status(500).json({
        success: false,
        message: "Failed to complete trade.",
      });
  }
};

export {
  createManualTrade,
  createAutoTrade,
  getTradeHistory,
};