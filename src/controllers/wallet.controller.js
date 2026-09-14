import Wallet from "../models/wallet.model.js";
import User from "../models/user.model.js";
import Deposit from "../models/deposit.model.js";
import Transaction from "../models/transaction.model.js";
import createWalletForUser from "../utils/createWallet.js";

const getWallet = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    let wallet = await Wallet.findOne({
  user: user._id,
});

if (!wallet) {
  wallet = await createWalletForUser(user._id);
}

    return res.status(200).json({
      success: true,
      wallet: {
        id: wallet._id,
        asset: wallet.asset,
        network: wallet.network,
        depositAddress: wallet.depositAddress,
        availableBalance: wallet.availableBalance,
        lockedBalance: wallet.lockedBalance,
        totalBalance:
          wallet.availableBalance + wallet.lockedBalance,
      },
    });
  } catch (error) {
    console.error("Get wallet error:", error);

    return res.status(500).json({
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