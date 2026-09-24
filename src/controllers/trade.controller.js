import mongoose from "mongoose";
import Trade from "../models/trade.model.js";
import Wallet from "../models/wallet.model.js";

import {
  processDailyEarning,
} from "../services/dailyEarning.service.js";

import {
  finalizeAutoTrade,
} from "../services/autoTrade.service.js";

const PROCESSING_TIME_MS =
  5 * 60 * 1000;

const AUTO_TRADE_COOLDOWN_MS =
  24 * 60 * 60 * 1000;

const getTodayString = () => {
  return new Date()
    .toISOString()
    .slice(0, 10);
};

/*
|--------------------------------------------------------------------------
| CREATE MANUAL TRADE
|--------------------------------------------------------------------------
|
| Kept for backend compatibility.
| The frontend will no longer expose this action.
|
*/

const createManualTrade = async (
  req,
  res
) => {
  try {
    const userId = req.user.id;
    const today = getTodayString();

    /*
     * Keep the existing one-trade-per-calendar-day
     * protection for the legacy manual endpoint.
     */

    const existingTrade =
      await Trade.findOne({
        user: userId,
        date: today,
      });

    if (existingTrade) {
      throw new Error(
        "DAILY_TRADE_ALREADY_COMPLETED"
      );
    }

    const trade =
      await Trade.create({
        user: userId,
        type: "MANUAL",
        date: today,
        status: "COMPLETED",
        completedAt: new Date(),
      });

    try {
      const earning =
        await processDailyEarning({
          userId,
          tradeId: trade._id,
        });

      return res.status(201).json({
        success: true,
        message:
          "Trade completed and daily return credited.",
        trade,
        earning,
      });
    } catch (error) {
      await Trade.findByIdAndDelete(
        trade._id
      );

      throw error;
    }
  } catch (error) {
    console.error(
      "Manual trade error:",
      error
    );

    return handleTradeError(
      res,
      error
    );
  }
};

/*
|--------------------------------------------------------------------------
| AUTO TRADE
|--------------------------------------------------------------------------
|
| Start Auto Trade.
|
| IMPORTANT:
| This endpoint DOES NOT credit the earning.
|
| It only:
|
| 1. Validates the user
| 2. Checks 24-hour cooldown
| 3. Checks existing processing trade
| 4. Locks the wallet
| 5. Creates PROCESSING trade
| 6. Returns the 5-minute timer
|
| The background finalizer completes it later.
|
*/

const createAutoTrade = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      const userId = req.user.id;

      /*
       * ----------------------------------------------------------
       * 1. CHECK FOR ACTIVE PROCESSING TRADE
       * ----------------------------------------------------------
       */

      const processingTrade =
        await Trade.findOne({
          user: userId,
          type: "AUTO",
          status: "PROCESSING",
        })
          .sort({
            createdAt: -1,
          })
          .session(session);

      if (processingTrade) {
        /*
         * If its 5-minute period has already ended,
         * finalize it.
         *
         * This normally gets handled by the background
         * finalizer, but this also makes the API resilient.
         */
        if (
          processingTrade.processingUntil &&
          new Date() >=
          new Date(
            processingTrade.processingUntil
          )
        ) {
          /*
           * We cannot call finalizeAutoTrade() here because
           * it starts its own MongoDB session.
           *
           * The background finalizer will handle it.
           */
          throw new Error(
            "TRADE_READY_TO_FINALIZE"
          );
        }

        throw new Error(
          "TRADE_STILL_PROCESSING"
        );
      }

      /*
       * ----------------------------------------------------------
       * 2. CHECK 24-HOUR AUTO TRADE COOLDOWN
       * ----------------------------------------------------------
       */

      const lastAutoTrade =
        await Trade.findOne({
          user: userId,
          type: "AUTO",
          status: "COMPLETED",
        })
          .sort({
            completedAt: -1,
          })
          .session(session);

      if (
        lastAutoTrade?.cooldownUntil &&
        new Date() <
        new Date(
          lastAutoTrade.cooldownUntil
        )
      ) {
        throw new Error(
          "AUTO_TRADE_COOLDOWN"
        );
      }

      /*
       * ----------------------------------------------------------
       * 3. GET WALLET
       * ----------------------------------------------------------
       */

      const wallet =
        await Wallet.findOne({
          user: userId,
          asset: "USDT",
          network: "BEP20",
        }).session(session);

      if (!wallet) {
        throw new Error(
          "WALLET_NOT_FOUND"
        );
      }

      /*
       * ----------------------------------------------------------
       * 4. CHECK AVAILABLE BALANCE
       * ----------------------------------------------------------
       */

      const availableBalance =
        Number(
          wallet.availableBalance || 0
        );

      if (availableBalance <= 0) {
        throw new Error(
          "INSUFFICIENT_BALANCE"
        );
      }

      /*
       * ----------------------------------------------------------
       * 5. START 5-MINUTE PROCESSING
       * ----------------------------------------------------------
       */

      const now = new Date();

      const processingUntil =
        new Date(
          now.getTime() +
          PROCESSING_TIME_MS
        );

      /*
       * Move the entire available balance
       * into locked balance.
       */

      wallet.availableBalance = 0;

      wallet.lockedBalance =
        Number(
          wallet.lockedBalance || 0
        ) + availableBalance;

      await wallet.save({
        session,
      });

      /*
       * ----------------------------------------------------------
       * 6. CREATE PROCESSING TRADE
       * ----------------------------------------------------------
       */

      const trade =
        await Trade.create(
          [
            {
              user: userId,

              type: "AUTO",

              date: getTodayString(),

              status: "PROCESSING",

              processingUntil,

              lockedAmount:
                availableBalance,

              completedAt: null,

              cooldownUntil: null,
            },
          ],
          {
            session,
          }
        );

      result = {
        trade: trade[0],

        processing: true,

        processingUntil,

        cooldownUntil: null,
      };
    });

    /*
     * ----------------------------------------------------------
     * 7. RESPONSE
     * ----------------------------------------------------------
     */

    return res.status(201).json({
      success: true,

      message:
        "Auto Trade started. Your wallet is being processed.",

      trade: result.trade,

      processing:
        result.processing,

      processingUntil:
        result.processingUntil,

      cooldownUntil:
        result.cooldownUntil,
    });
  } catch (error) {
    console.error(
      "Auto Trade error:",
      error
    );

    return handleTradeError(
      res,
      error
    );
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| TRADE HISTORY
|--------------------------------------------------------------------------
*/

const getTradeHistory = async (
  req,
  res
) => {
  try {
    const trades =
      await Trade.find({
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
    console.error(
      "Trade history error:",
      error
    );

    return res.status(500).json({
      success: false,

      message:
        "Failed to load trade history.",
    });
  }
};

/*
|--------------------------------------------------------------------------
| ERROR HANDLER
|--------------------------------------------------------------------------
*/

const handleTradeError = (
  res,
  error
) => {
  switch (error.message) {
    case "DAILY_TRADE_ALREADY_COMPLETED":
      return res.status(400).json({
        success: false,

        message:
          "You have already completed today's trade.",
      });

    case "TRADE_STILL_PROCESSING":
      return res.status(400).json({
        success: false,

        message:
          "Your Auto Trade is still being processed.",
      });

    case "WALLET_NOT_FOUND":
      return res.status(404).json({
        success: false,

        message:
          "Wallet not found.",
      });

    case "INSUFFICIENT_BALANCE":
      return res.status(400).json({
        success: false,

        message:
          "Your wallet balance is unavailable.",
      });

    case "NO_ELIGIBLE_PACKAGE":
      return res.status(400).json({
        success: false,

        message:
          "Your wallet balance does not match an eligible package.",
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

    case "INVALID_LOCKED_AMOUNT":
      return res.status(400).json({
        success: false,

        message:
          "Invalid Auto Trade locked amount.",
      });

    case "LOCKED_BALANCE_MISMATCH":
      return res.status(409).json({
        success: false,

        message:
          "Wallet processing state could not be verified.",
      });

    case "TRADE_NOT_FOUND":
      return res.status(404).json({
        success: false,

        message:
          "Auto Trade could not be found.",
      });

    case "TRADE_STILL_PROCESSING":
      return res.status(400).json({
        success: false,
        message:
          "Your Auto Trade is still being processed.",
        processing: true,
      });

    case "TRADE_READY_TO_FINALIZE":
      return res.status(409).json({
        success: false,
        message:
          "Your Auto Trade is finishing. Please refresh your wallet shortly.",
        processing: true,
      });

    case "AUTO_TRADE_COOLDOWN":
      return res.status(400).json({
        success: false,
        message:
          "Auto Trade is available again after the 24-hour cooldown.",
      });

    case "INSUFFICIENT_BALANCE":
      return res.status(400).json({
        success: false,
        message:
          "Your wallet balance is unavailable.",
      });

    default:
      return res.status(500).json({
        success: false,

        message:
          "Failed to complete trade.",
      });
  }
};

export {
  createManualTrade,
  createAutoTrade,
  getTradeHistory,
};