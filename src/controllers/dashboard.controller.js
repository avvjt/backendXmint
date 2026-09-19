import Wallet from "../models/wallet.model.js";
import UserPackage from "../models/userPackage.model.js";
import DailyEarning from "../models/dailyEarning.model.js";
import Transaction from "../models/transaction.model.js";
import Trade from "../models/trade.model.js";
import TeamIncome from "../models/teamIncome.model.js";

const getTodayString = () => {
  return new Date().toISOString().slice(0, 10);
};

const getDashboard = async (req, res) => {
  try {
    const userId = req.user.id;
    const today = getTodayString();

    const [
      wallet,
      userPackage,
      todayEarning,
      earnings,
      transactions,
      trades,
      teamIncome,
    ] = await Promise.all([
      Wallet.findOne({
        user: userId,
        asset: "USDT",
        network: "BEP20",
      }).lean(),

      UserPackage.findOne({
        user: userId,
      }).lean(),

      DailyEarning.findOne({
        user: userId,
        date: today,
      }).lean(),

      DailyEarning.find({
        user: userId,
        status: "COMPLETED",
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),

      Transaction.find({
        user: userId,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),

      Trade.find({
        user: userId,
      })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean(),

      TeamIncome.find({
        user: userId,
        status: "COMPLETED",
      })
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
    ]);

    const totalEarnings = earnings.reduce(
      (total, earning) =>
        total + Number(earning.earningAmount || 0),
      0
    );

    const totalTeamIncome = teamIncome.reduce(
      (total, income) =>
        total + Number(income.amount || 0),
      0
    );

    const totalTradeCount = trades.length;

    const autoTradeCount = trades.filter(
      (trade) => trade.type === "AUTO"
    ).length;

    const manualTradeCount = trades.filter(
      (trade) => trade.type === "MANUAL"
    ).length;

    const todayTrade = trades.find(
      (trade) =>
        trade.date === today &&
        trade.status === "COMPLETED"
    );

    return res.status(200).json({
      success: true,

      dashboard: {
        wallet: {
          id: wallet?._id || null,
          asset: wallet?.asset || "USDT",
          network: wallet?.network || "BEP20",
          availableBalance: Number(
            wallet?.availableBalance || 0
          ),
          lockedBalance: Number(
            wallet?.lockedBalance || 0
          ),
          totalBalance:
            Number(wallet?.availableBalance || 0) +
            Number(wallet?.lockedBalance || 0),
          depositAddress:
            wallet?.depositAddress || null,
        },

        package: userPackage
          ? {
              key: userPackage.packageKey,
              name: userPackage.packageName,
              baseAmount: Number(
                userPackage.baseAmount || 0
              ),
              dailyRate: Number(
                userPackage.dailyRate || 0
              ),
              isActive:
                Boolean(userPackage.isActive),
              lastEarningDate:
                userPackage.lastEarningDate || null,
              lastTradeDate:
                userPackage.lastTradeDate || null,
            }
          : null,

        earnings: {
          today: Number(
            todayEarning?.earningAmount || 0
          ),
          total: Number(
            totalEarnings.toFixed(2)
          ),
          teamIncome: Number(
            totalTeamIncome.toFixed(2)
          ),
        },

        trading: {
          total: totalTradeCount,
          manual: manualTradeCount,
          auto: autoTradeCount,
          todayCompleted:
            Boolean(todayTrade),
          canTrade:
            !todayTrade,
          lastTrade: trades[0] || null,
        },

        recentActivity:
          transactions.slice(0, 10),

        recentEarnings:
          earnings.slice(0, 10),

        recentTrades:
          trades.slice(0, 10),
      },
    });
  } catch (error) {
    console.error(
      "Dashboard error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Failed to load dashboard.",
    });
  }
};

export {
  getDashboard,
};