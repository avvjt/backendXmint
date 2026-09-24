import mongoose from "mongoose";

import Trade from "../models/trade.model.js";
import Wallet from "../models/wallet.model.js";

import {
  processDailyEarning,
} from "./dailyEarning.service.js";

/*
|--------------------------------------------------------------------------
| FINALIZE ONE AUTO TRADE
|--------------------------------------------------------------------------
|
| This function:
|
| 1. Checks that the 5-minute processing period is finished
| 2. Restores the locked balance
| 3. Completes the Trade
| 4. Credits the existing daily earning
| 5. Creates the 24-hour cooldown
|
| Everything runs inside ONE MongoDB transaction.
|
*/

const finalizeAutoTrade = async (tradeId) => {
  if (!tradeId) {
    throw new Error("TRADE_NOT_FOUND");
  }

  const session =
    await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(
      async () => {
        /*
         * ------------------------------------------------------
         * 1. FIND PROCESSING TRADE
         * ------------------------------------------------------
         */

        const trade =
          await Trade.findOne({
            _id: tradeId,
            type: "AUTO",
            status: "PROCESSING",
          }).session(session);

        if (!trade) {
          /*
           * It may already have been finalized
           * by another process.
           */
          const existingTrade =
            await Trade.findById(
              tradeId
            ).session(session);

          if (
            existingTrade?.status ===
            "COMPLETED"
          ) {
            result = {
              trade: existingTrade,
              alreadyFinalized: true,
            };

            return;
          }

          throw new Error(
            "TRADE_NOT_FOUND"
          );
        }

        /*
         * ------------------------------------------------------
         * 2. CHECK 5-MINUTE TIMER
         * ------------------------------------------------------
         */

        const now = new Date();

        if (
          !trade.processingUntil ||
          now <
            new Date(
              trade.processingUntil
            )
        ) {
          throw new Error(
            "TRADE_STILL_PROCESSING"
          );
        }

        /*
         * ------------------------------------------------------
         * 3. FIND WALLET
         * ------------------------------------------------------
         */

        const wallet =
          await Wallet.findOne({
            user: trade.user,
            asset: "USDT",
            network: "BEP20",
          }).session(session);

        if (!wallet) {
          throw new Error(
            "WALLET_NOT_FOUND"
          );
        }

        /*
         * ------------------------------------------------------
         * 4. VERIFY LOCKED AMOUNT
         * ------------------------------------------------------
         */

        const lockedAmount = Number(
          trade.lockedAmount || 0
        );

        if (lockedAmount <= 0) {
          throw new Error(
            "INVALID_LOCKED_AMOUNT"
          );
        }

        const currentLockedBalance =
          Number(
            wallet.lockedBalance || 0
          );

        if (
          currentLockedBalance <
          lockedAmount
        ) {
          throw new Error(
            "LOCKED_BALANCE_MISMATCH"
          );
        }

        /*
         * ------------------------------------------------------
         * 5. RESTORE LOCKED BALANCE
         * ------------------------------------------------------
         */

        wallet.lockedBalance =
          currentLockedBalance -
          lockedAmount;

        wallet.availableBalance =
          Number(
            wallet.availableBalance || 0
          ) + lockedAmount;

        await wallet.save({
          session,
        });

        /*
         * ------------------------------------------------------
         * 6. COMPLETE TRADE
         * ------------------------------------------------------
         */

        trade.status = "COMPLETED";

        trade.completedAt = now;

        trade.processingUntil = null;

        /*
         * Auto Trade becomes available again
         * 24 hours after this completion.
         */

        trade.cooldownUntil =
          new Date(
            now.getTime() +
              24 * 60 * 60 * 1000
          );

        await trade.save({
          session,
        });

        /*
         * ------------------------------------------------------
         * 7. PROCESS EXISTING DAILY EARNING
         * ------------------------------------------------------
         *
         * IMPORTANT:
         *
         * lockedAmount is the exact balance that
         * existed when Auto Trade started.
         *
         * We use that amount for package selection.
         */

        const earning =
          await processDailyEarning({
            userId: trade.user,
            tradeId: trade._id,
            session,
            packageBalance:
              lockedAmount,
          });

        result = {
          trade,
          earning,
          alreadyFinalized: false,
        };
      }
    );

    return result;
  } finally {
    await session.endSession();
  }
};

/*
|--------------------------------------------------------------------------
| FINALIZE EXPIRED AUTO TRADES
|--------------------------------------------------------------------------
|
| Background worker calls this every minute.
|
*/

const finalizeExpiredAutoTrades =
  async () => {
    const now = new Date();

    /*
     * Find a small batch so one bad/test
     * record doesn't overload the server.
     */

    const trades =
      await Trade.find({
        type: "AUTO",
        status: "PROCESSING",
        processingUntil: {
          $lte: now,
        },
      })
        .sort({
          processingUntil: 1,
        })
        .limit(50)
        .select("_id");

    if (!trades.length) {
      return 0;
    }

    let finalizedCount = 0;

    for (const trade of trades) {
      try {
        await finalizeAutoTrade(
          trade._id
        );

        finalizedCount += 1;

        console.log(
          `[AutoTrade] Finalized ${trade._id}`
        );
      } catch (error) {
        console.error(
          `[AutoTrade] Failed ${trade._id}:`,
          error?.message || error
        );
      }
    }

    return finalizedCount;
  };

export {
  finalizeAutoTrade,
  finalizeExpiredAutoTrades,
};