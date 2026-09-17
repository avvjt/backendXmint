import Deposit from "../models/deposit.model.js";
import Withdrawal from "../models/withdrawal.model.js";

// ==========================================
// GET ALL DEPOSITS
// ==========================================

const getAdminDeposits = async (req, res) => {
  try {
    const deposits = await Deposit.find()
      .populate("user", "email fullName username")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      deposits,
    });
  } catch (error) {
    console.error("Admin deposits error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch deposits",
    });
  }
};

// ==========================================
// GET ALL WITHDRAWALS
// ==========================================

const getAdminWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find()
      .populate("user", "email fullName username")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      withdrawals,
    });
  } catch (error) {
    console.error("Admin withdrawals error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to fetch withdrawals",
    });
  }
};

export {
  getAdminDeposits,
  getAdminWithdrawals,
};