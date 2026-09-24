import mongoose from "mongoose";

import Wallet from "../models/wallet.model.js";
import UserPackage from "../models/userPackage.model.js";
import DailyEarning from "../models/dailyEarning.model.js";
import Trade from "../models/trade.model.js";
import Transaction from "../models/transaction.model.js";

import {
  getPackageByBalance,
} from "../config/packageConfig.js";

import {
  processTeamCommission,
} from "./teamIncome.service.js";

const getTodayString = () => {
  return new Date().toISOString().slice(0, 10);
};

/*
|--------------------------------------------------------------------------
| PROCESS DAILY EARNING
|--------------------------------------------------------------------------
|
| session is optional.
|
| Normal callers:
|   processDailyEarning({ userId, tradeId })
|
| Auto Trade finalization:
|   processDailyEarning({
|     userId,
|     tradeId,
|     session,
|     packageBalance
|   })
|
| When a session is supplied, the caller controls
| the MongoDB transaction.
|
*/

const processDailyEarning = async ({
  userId,
  tradeId,
  session = null,
  packageBalance = null,
}) => {
  if (!userId || !tradeId) {
    throw new Error(
      "User ID and trade ID are required"
    );
  }

  const today = getTodayString();

  const execute = async (activeSession) => {
    // ==============================================
    // 1. FIND USER WALLET
    // ==============================================

    const wallet = await Wallet.findOne({
      user: userId,
      asset: "USDT",
      network: "BEP20",
    }).session(activeSession);

    if (!wallet) {
      throw new Error("WALLET_NOT_FOUND");
    }

    // ==============================================
    // 2. VERIFY TODAY'S TRADE
    // ==============================================

    const trade = await Trade.findOne({
      _id: tradeId,
      user: userId,
      date: today,
      status: "COMPLETED",
    }).session(activeSession);

    if (!trade) {
      throw new Error(
        "VALID_TODAY_TRADE_NOT_FOUND"
      );
    }

    // ==============================================
    // 3. PREVENT SECOND DAILY EARNING
    // ==============================================

    const existingEarning =
      await DailyEarning.findOne({
        user: userId,
        date: today,
      }).session(activeSession);

    if (existingEarning) {
      throw new Error(
        "DAILY_EARNING_ALREADY_CLAIMED"
      );
    }

    // ==============================================
    // 4. DETERMINE PACKAGE
    // ==============================================

    /*
     * For Auto Trade we use the balance that was
     * captured when processing started.
     *
     * For existing callers, this falls back to
     * the current available wallet balance.
     */

    const balanceForPackage =
      packageBalance !== null
        ? Number(packageBalance)
        : Number(
            wallet.availableBalance || 0
          );

    const packageInfo =
      getPackageByBalance(
        balanceForPackage
      );

    if (!packageInfo) {
      throw new Error(
        "NO_ELIGIBLE_PACKAGE"
      );
    }

    // ==============================================
    // 5. FIND / UPDATE USER PACKAGE
    // ==============================================

    let userPackage =
      await UserPackage.findOne({
        user: userId,
      }).session(activeSession);

    if (!userPackage) {
      userPackage =
        new UserPackage({
          user: userId,
        });
    }

    userPackage.packageKey =
      packageInfo.key;

    userPackage.packageName =
      packageInfo.name;

    /*
     * IMPORTANT:
     *
     * The initial base amount is established
     * from the balance used for this Auto Trade.
     *
     * Earnings do not compound this amount.
     */

    if (
      !userPackage.baseAmount ||
      userPackage.baseAmount <= 0
    ) {
      userPackage.baseAmount =
        balanceForPackage;
    }

    userPackage.dailyRate =
      packageInfo.dailyRate;

    userPackage.isActive = true;

    userPackage.lastEarningDate = today;
    userPackage.lastTradeDate = today;

    await userPackage.save({
      session: activeSession,
    });

    // ==============================================
    // 6. CALCULATE DAILY RETURN
    // ==============================================

    const earningAmount =
      Math.round(
        userPackage.baseAmount *
          (packageInfo.dailyRate / 100) *
          100
      ) / 100;

    if (earningAmount <= 0) {
      throw new Error(
        "INVALID_EARNING_AMOUNT"
      );
    }

    // ==============================================
    // 7. CREDIT USER WALLET
    // ==============================================

    wallet.availableBalance =
      Number(wallet.availableBalance || 0) +
      earningAmount;

    await wallet.save({
      session: activeSession,
    });

    // ==============================================
    // 8. CREATE DAILY EARNING
    // ==============================================

    const [dailyEarning] =
      await DailyEarning.create(
        [
          {
            user: userId,
            userPackage:
              userPackage._id,

            date: today,

            baseAmount:
              userPackage.baseAmount,

            packageKey:
              packageInfo.key,

            dailyRate:
              packageInfo.dailyRate,

            earningAmount,

            tradeType:
              trade.type,

            tradeReference:
              trade._id,

            status: "COMPLETED",

            creditedAt: new Date(),
          },
        ],
        {
          session: activeSession,
        }
      );

    // ==============================================
    // 9. CREATE TRANSACTION HISTORY
    // ==============================================

    await Transaction.create(
      [
        {
          user: userId,

          wallet: wallet._id,

          type: "EARNING",

          asset: "USDT",

          network: "BEP20",

          amount: earningAmount,

          status: "COMPLETED",

          referenceId:
            dailyEarning._id,

          description:
            `Daily ${packageInfo.name} return`,
        },
      ],
      {
        session: activeSession,
      }
    );

    // ==============================================
    // 10. PROCESS TEAM COMMISSION
    // ==============================================

    const teamCommission =
      await processTeamCommission({
        sourceUserId: userId,

        earningAmount,

        referenceId:
          dailyEarning._id,

        session: activeSession,
      });

    return {
      dailyEarning,

      earningAmount,

      package: packageInfo,

      teamCommission,
    };
  };

  /*
   * ============================================================
   * EXTERNAL SESSION
   * ============================================================
   *
   * Used by Auto Trade finalization.
   *
   */

  if (session) {
    const result =
      await execute(session);

    return {
      success: true,

      earning:
        result.dailyEarning,

      earningAmount:
        result.earningAmount,

      package:
        result.package,

      teamCommission:
        result.teamCommission,
    };
  }

  /*
   * ============================================================
   * OWN TRANSACTION
   * ============================================================
   *
   * Keeps existing behavior for other callers.
   *
   */

  const ownSession =
    await mongoose.startSession();

  try {
    let result;

    await ownSession.withTransaction(
      async () => {
        result =
          await execute(ownSession);
      }
    );

    return {
      success: true,

      earning:
        result.dailyEarning,

      earningAmount:
        result.earningAmount,

      package:
        result.package,

      teamCommission:
        result.teamCommission,
    };
  } finally {
    await ownSession.endSession();
  }
};

export {
  processDailyEarning,
};