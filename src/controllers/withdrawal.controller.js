import mongoose from "mongoose";

import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import Withdrawal from "../models/withdrawal.model.js";
import Transaction from "../models/transaction.model.js";

// =====================================================
// CREATE WITHDRAWAL
// =====================================================

const createWithdrawal = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { amount, destinationAddress } = req.body;

    // -----------------------------
    // 1. Basic validation
    // -----------------------------

    if (!amount || !destinationAddress) {
      return res.status(400).json({
        message: "Amount and destination address are required",
      });
    }

    const withdrawalAmount = Number(amount);

    if (!Number.isFinite(withdrawalAmount) || withdrawalAmount <= 0) {
      return res.status(400).json({
        message: "Invalid withdrawal amount",
      });
    }

    // -----------------------------
    // 2. BEP20 / EVM address validation
    // -----------------------------

    const trimmedAddress = destinationAddress.trim();

    const isValidAddress =
      /^0x[a-fA-F0-9]{40}$/.test(trimmedAddress);

    if (!isValidAddress) {
      return res.status(400).json({
        message: "Invalid BEP20 wallet address",
      });
    }

    // -----------------------------
    // 3. Find user
    // -----------------------------

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // -----------------------------
    // 4. Account activation check
    // -----------------------------

    if (user.accountStatus !== "ACTIVE") {
      return res.status(403).json({
        message: "Account must be active before withdrawing",
      });
    }

    // -----------------------------
    // 5. Find wallet
    // -----------------------------

    const wallet = await Wallet.findOne({
      user: user._id,
      asset: "USDT",
      network: "BEP20",
    });

    if (!wallet) {
      return res.status(404).json({
        message: "Wallet not found",
      });
    }

    // -----------------------------
    // 6. Minimum withdrawal
    // -----------------------------

    const minimumWithdrawal = 10;

    if (withdrawalAmount < minimumWithdrawal) {
      return res.status(400).json({
        message: `Minimum withdrawal is ${minimumWithdrawal} USDT`,
      });
    }

    // -----------------------------
    // 7. Balance check
    // -----------------------------

    if (withdrawalAmount > wallet.availableBalance) {
      return res.status(400).json({
        message: "Insufficient available balance",
      });
    }

    // -----------------------------
    // 8. Atomic accounting operation
    // -----------------------------

    let withdrawal;
    let transaction;

    await session.withTransaction(async () => {
      // Re-fetch wallet inside transaction
      const lockedWallet = await Wallet.findOne({
        _id: wallet._id,
      }).session(session);

      if (!lockedWallet) {
        throw new Error("WALLET_NOT_FOUND");
      }

      // Re-check balance inside transaction
      if (withdrawalAmount > lockedWallet.availableBalance) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // Available → Locked
      lockedWallet.availableBalance -= withdrawalAmount;
      lockedWallet.lockedBalance += withdrawalAmount;

      await lockedWallet.save({ session });

      // Create withdrawal
      [withdrawal] = await Withdrawal.create(
        [
          {
            user: user._id,
            wallet: lockedWallet._id,
            asset: "USDT",
            network: "BEP20",
            amount: withdrawalAmount,
            destinationAddress: trimmedAddress,
            status: "PENDING",
          },
        ],
        { session }
      );

      // Create transaction history
      [transaction] = await Transaction.create(
        [
          {
            user: user._id,
            wallet: lockedWallet._id,
            type: "WITHDRAWAL",
            asset: "USDT",
            network: "BEP20",
            amount: withdrawalAmount,
            status: "PENDING",
            referenceId: withdrawal._id,
            description: "USDT withdrawal",
          },
        ],
        { session }
      );
    });

    return res.status(201).json({
      success: true,
      message: "Withdrawal request submitted",
      withdrawal: {
        id: withdrawal._id,
        amount: withdrawal.amount,
        asset: withdrawal.asset,
        network: withdrawal.network,
        destinationAddress: withdrawal.destinationAddress,
        status: withdrawal.status,
      },
      transaction: {
        id: transaction._id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
      },
    });
  } catch (error) {
    console.error("Create withdrawal error:", error);

    if (error.message === "INSUFFICIENT_BALANCE") {
      return res.status(400).json({
        message: "Insufficient available balance",
      });
    }

    if (error.message === "WALLET_NOT_FOUND") {
      return res.status(404).json({
        message: "Wallet not found",
      });
    }

    return res.status(500).json({
      message: "Failed to create withdrawal",
    });
  } finally {
    await session.endSession();
  }
};

// =====================================================
// UPDATE WITHDRAWAL STATUS
// =====================================================

const updateWithdrawalStatus = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    const { withdrawalId } = req.params;
    const { status, txHash, failureReason } = req.body;

    const allowedStatuses = [
      "PROCESSING",
      "COMPLETED",
      "FAILED",
    ];

    // -----------------------------
    // 1. Validate status
    // -----------------------------

    if (!allowedStatuses.includes(status)) {
      return res.status(400).json({
        message: "Invalid withdrawal status",
      });
    }

    let withdrawal;

    await session.withTransaction(async () => {
      // -----------------------------
      // 2. Find withdrawal
      // -----------------------------

      withdrawal = await Withdrawal.findById(
        withdrawalId
      ).session(session);

      if (!withdrawal) {
        throw new Error("WITHDRAWAL_NOT_FOUND");
      }

      // -----------------------------
      // 3. Prevent changes after final state
      // -----------------------------

      if (
        withdrawal.status === "COMPLETED" ||
        withdrawal.status === "FAILED"
      ) {
        throw new Error("WITHDRAWAL_ALREADY_FINAL");
      }

      // -----------------------------
      // 4. Find wallet
      // -----------------------------

      const wallet = await Wallet.findById(
        withdrawal.wallet
      ).session(session);

      if (!wallet) {
        throw new Error("WALLET_NOT_FOUND");
      }

      // -----------------------------
      // 5. Find related transaction
      // -----------------------------

      const transaction = await Transaction.findOne({
        referenceId: withdrawal._id,
        type: "WITHDRAWAL",
      }).session(session);

      if (!transaction) {
        throw new Error("TRANSACTION_NOT_FOUND");
      }

      // =================================================
      // PROCESSING
      // =================================================

      if (status === "PROCESSING") {
        // Only PENDING → PROCESSING
        if (withdrawal.status !== "PENDING") {
          throw new Error("INVALID_STATUS_TRANSITION");
        }

        withdrawal.status = "PROCESSING";
        transaction.status = "PROCESSING";

        await withdrawal.save({ session });
        await transaction.save({ session });

        return;
      }

      // =================================================
      // COMPLETED
      // =================================================

      if (status === "COMPLETED") {
        // Only PROCESSING → COMPLETED
        if (withdrawal.status !== "PROCESSING") {
          throw new Error("INVALID_STATUS_TRANSITION");
        }

        if (
          !txHash ||
          typeof txHash !== "string" ||
          !txHash.trim()
        ) {
          throw new Error("TX_HASH_REQUIRED");
        }

        if (wallet.lockedBalance < withdrawal.amount) {
          throw new Error("LOCKED_BALANCE_ERROR");
        }

        // Release locked funds
        wallet.lockedBalance -= withdrawal.amount;

        withdrawal.status = "COMPLETED";
        withdrawal.txHash = txHash.trim();
        withdrawal.processedAt = new Date();
        withdrawal.completedAt = new Date();

        transaction.status = "COMPLETED";
        transaction.txHash = txHash.trim();

        await wallet.save({ session });
        await withdrawal.save({ session });
        await transaction.save({ session });

        return;
      }

      // =================================================
      // FAILED
      // =================================================

      if (status === "FAILED") {
        // PENDING or PROCESSING → FAILED
        if (
          withdrawal.status !== "PENDING" &&
          withdrawal.status !== "PROCESSING"
        ) {
          throw new Error("INVALID_STATUS_TRANSITION");
        }

        if (wallet.lockedBalance < withdrawal.amount) {
          throw new Error("LOCKED_BALANCE_ERROR");
        }

        // Return locked funds
        wallet.lockedBalance -= withdrawal.amount;
        wallet.availableBalance += withdrawal.amount;

        withdrawal.status = "FAILED";
        withdrawal.failureReason =
          failureReason || "Withdrawal failed";
        withdrawal.processedAt = new Date();

        transaction.status = "FAILED";
        transaction.description =
          failureReason || "USDT withdrawal failed";

        await wallet.save({ session });
        await withdrawal.save({ session });
        await transaction.save({ session });
      }
    });

    return res.status(200).json({
      success: true,
      message: `Withdrawal marked as ${status}`,
      withdrawal,
    });
  } catch (error) {
    console.error(
      "Update withdrawal status error:",
      error
    );

    // -----------------------------
    // Error handling
    // -----------------------------

    if (error.message === "WITHDRAWAL_NOT_FOUND") {
      return res.status(404).json({
        message: "Withdrawal not found",
      });
    }

    if (error.message === "WITHDRAWAL_ALREADY_FINAL") {
      return res.status(400).json({
        message: "Withdrawal has already reached a final status",
      });
    }

    if (error.message === "INVALID_STATUS_TRANSITION") {
      return res.status(400).json({
        message: "Invalid withdrawal status transition",
      });
    }

    if (error.message === "WALLET_NOT_FOUND") {
      return res.status(404).json({
        message: "Wallet not found",
      });
    }

    if (error.message === "TRANSACTION_NOT_FOUND") {
      return res.status(404).json({
        message: "Related transaction not found",
      });
    }

    if (error.message === "TX_HASH_REQUIRED") {
      return res.status(400).json({
        message: "Transaction hash is required",
      });
    }

    if (error.message === "LOCKED_BALANCE_ERROR") {
      return res.status(400).json({
        message: "Locked balance is inconsistent",
      });
    }

    return res.status(500).json({
      message: "Failed to update withdrawal",
    });
  } finally {
    await session.endSession();
  }
};

// =====================================================
// EXPORTS
// =====================================================

export {
  createWithdrawal,
  updateWithdrawalStatus,
};