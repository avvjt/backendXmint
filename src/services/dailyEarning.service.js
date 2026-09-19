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

const processDailyEarning = async ({
  userId,
  tradeId,
}) => {
  if (!userId || !tradeId) {
    throw new Error(
      "User ID and trade ID are required"
    );
  }

  const today = getTodayString();

  const session = await mongoose.startSession();

  try {
    let result;

    await session.withTransaction(async () => {
      // ==============================================
      // 1. FIND USER WALLET
      // ==============================================

      const wallet = await Wallet.findOne({
        user: userId,
        asset: "USDT",
        network: "BEP20",
      }).session(session);

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
      }).session(session);

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
        }).session(session);

      if (existingEarning) {
        throw new Error(
          "DAILY_EARNING_ALREADY_CLAIMED"
        );
      }

      // ==============================================
      // 4. DETERMINE CURRENT PACKAGE
      // ==============================================

      const packageInfo =
        getPackageByBalance(
          wallet.availableBalance
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
        }).session(session);

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
       * If there is no existing base amount,
       * establish the current wallet balance
       * as the initial base amount.
       *
       * Once established, earnings do NOT
       * compound this amount.
       */
      if (
        !userPackage.baseAmount ||
        userPackage.baseAmount <= 0
      ) {
        userPackage.baseAmount =
          wallet.availableBalance;
      }

      userPackage.dailyRate =
        packageInfo.dailyRate;

      userPackage.isActive = true;

      userPackage.lastEarningDate = today;
      userPackage.lastTradeDate = today;

      await userPackage.save({ session });

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

      wallet.availableBalance +=
        earningAmount;

      await wallet.save({ session });

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
          { session }
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
        { session }
      );

      // ==============================================
      // 10. PROCESS TEAM COMMISSION
      // ==============================================

      const teamCommission =
        await processTeamCommission({
          sourceUserId: userId,
          earningAmount,
          referenceId: dailyEarning._id,
          session,
        });

      result = {
        dailyEarning,
        earningAmount,
        package: packageInfo,
        teamCommission,
      };
    });



    return {
      success: true,
      earning: result.dailyEarning,
      earningAmount:
        result.earningAmount,
      package: result.package,
      teamCommission: result.teamCommission,
    };
  } finally {
    await session.endSession();
  }
};

export {
  processDailyEarning,
};