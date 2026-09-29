
import mongoose from "mongoose";
import Deposit from "../models/deposit.model.js";
import Wallet from "../models/wallet.model.js";
import Transaction from "../models/transaction.model.js";
import UserPackage from "../models/userPackage.model.js";
import { getPackageByBalance } from "../config/packageConfig.js";
import { processReferralBonus } from "../services/teamIncome.service.js";
import { syncTeamLevel } from "../services/team.service.js";
import activateUserFromDeposit from "../utils/activateUserFromDeposit.js";
import { verifyBscUsdtDeposit } from "../utils/verifyBscUsdtDeposit.js";

// GET /api/admin/deposits
export const getAdminDeposits = async (req, res) => {
  try {
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      100,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 20)
    );

    const allowedStatuses = [
      "PENDING",
      "UNDER_REVIEW",
      "CONFIRMED",
      "REJECTED",
      "FAILED",
    ];

    const requestedStatus = String(req.query.status || "PENDING")
      .trim()
      .toUpperCase();

    if (
      requestedStatus !== "ALL" &&
      !allowedStatuses.includes(requestedStatus)
    ) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit status filter.",
      });
    }

    const filter =
      requestedStatus === "ALL" ? {} : { status: requestedStatus };

    const [deposits, total] = await Promise.all([
      Deposit.find(filter)
        .populate("user", "name email")
        .sort({ submittedAt: -1, _id: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Deposit.countDocuments(filter),
    ]);

    return res.json({
      success: true,
      deposits,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Admin deposit list failed:", error);
    return res.status(500).json({
      success: false,
      message: "Unable to load deposit requests.",
    });
  }
};

// POST /api/admin/deposits/:id/approve
export const approveManualDeposit = async (req, res) => {
  const session = await mongoose.startSession();
  let transactionStarted = false;
  let userIdToActivate = null;

  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit ID.",
      });
    }

    // Load the pending request before contacting the blockchain.
    const deposit = await Deposit.findById(id).lean();

    if (!deposit) {
      return res.status(404).json({
        success: false,
        message: "Deposit request not found.",
      });
    }

    if (!["PENDING", "UNDER_REVIEW"].includes(deposit.status)) {
      return res.status(409).json({
        success: false,
        message: `Deposit cannot be approved from status ${deposit.status}.`,
      });
    }

    if (deposit.creditedAt) {
      return res.status(409).json({
        success: false,
        message: "This deposit has already been credited.",
      });
    }

    if (
      deposit.asset !== "USDT" ||
      deposit.network !== "BEP20"
    ) {
      return res.status(400).json({
        success: false,
        message: "Unsupported deposit asset or network.",
      });
    }

    // Never trust a previous verification result or the submitted amount.
    const verification = await verifyBscUsdtDeposit({
      txHash: deposit.txHash,
      amount: deposit.amount,
    });

    if (!verification.valid) {
      return res.status(422).json({
        success: false,
        pending: Boolean(verification.pending),
        message: verification.reason || "On-chain verification failed.",
        confirmations: verification.confirmations ?? 0,
        requiredConfirmations: verification.requiredConfirmations ?? 12,
      });
    }

    // Protect against any unexpected mismatch in stored deposit metadata.
    if (
      String(deposit.depositAddress).toLowerCase() !==
        verification.depositAddress ||
      Number(deposit.amount) !== Number(verification.verifiedAmount)
    ) {
      return res.status(422).json({
        success: false,
        message: "Stored deposit details do not match verified transaction details.",
      });
    }

    session.startTransaction();
    transactionStarted = true;

    // Atomically claim the request. Only one approval can succeed.
    const claimedDeposit = await Deposit.findOneAndUpdate(
      {
        _id: deposit._id,
        status: { $in: ["PENDING", "UNDER_REVIEW"] },
        creditedAt: null,
      },
      {
        $set: {
          status: "CONFIRMED",
          confirmations: verification.confirmations,
          confirmedAt: new Date(),
          creditedAt: new Date(),
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
          verifiedAmount: verification.verifiedAmount,
          verificationData: {
            blockNumber: verification.blockNumber,
            tokenContract: verification.tokenContract,
            fromAddress: verification.transfers?.[0]?.from || null,
            verifiedAt: verification.verifiedAt || new Date(),
          },
        },
      },
      { new: true, session }
    );

    if (!claimedDeposit) {
      throw new Error("DEPOSIT_ALREADY_REVIEWED");
    }

    const wallet = await Wallet.findOne({
      _id: claimedDeposit.wallet,
      user: claimedDeposit.user,
    }).session(session);

    if (!wallet) {
      throw new Error("DEPOSIT_WALLET_NOT_FOUND");
    }

    // Credit the balance inside the same transaction as the deposit update.
    const walletUpdate = await Wallet.updateOne(
      { _id: wallet._id },
      { $inc: { availableBalance: claimedDeposit.amount } },
      { session }
    );

    if (walletUpdate.matchedCount !== 1) {
      throw new Error("WALLET_CREDIT_FAILED");
    }

    const updatedWallet = await Wallet.findById(wallet._id).session(session);

    if (!updatedWallet) {
      throw new Error("DEPOSIT_WALLET_NOT_FOUND");
    }

    // Preserve the existing package-selection behavior.
    const packageInfo = getPackageByBalance(
      updatedWallet.availableBalance
    );

    if (packageInfo) {
      let userPackage = await UserPackage.findOne({
        user: claimedDeposit.user,
      }).session(session);

      if (!userPackage) {
        userPackage = new UserPackage({ user: claimedDeposit.user });
      }

      const previousPackageKey = userPackage.packageKey;
      const previousBaseAmount = Number(userPackage.baseAmount || 0);

      if (
        previousBaseAmount <= 0 ||
        !previousPackageKey ||
        packageInfo.key !== previousPackageKey
      ) {
        userPackage.baseAmount = updatedWallet.availableBalance;
      }

      userPackage.packageKey = packageInfo.key;
      userPackage.packageName = packageInfo.name;
      userPackage.dailyRate = packageInfo.dailyRate;
      userPackage.isActive = true;

      await userPackage.save({ session });
    }

    // Create the ledger record in the same database transaction.
    await Transaction.create(
      [
        {
          user: claimedDeposit.user,
          wallet: wallet._id,
          type: "DEPOSIT",
          asset: "USDT",
          network: "BEP20",
          amount: claimedDeposit.amount,
          status: "COMPLETED",
          referenceId: claimedDeposit._id,
          txHash: claimedDeposit.txHash,
          description: "Admin-approved BSC Mainnet USDT deposit",
        },
      ],
      { session }
    );

    // Preserve the existing referral and team-level processing.
    await processReferralBonus({
      referredUserId: claimedDeposit.user,
      depositId: claimedDeposit._id,
      depositAmount: claimedDeposit.amount,
      session,
    });

    await syncTeamLevel(claimedDeposit.user, session);

    await session.commitTransaction();
    transactionStarted = false;

    userIdToActivate = claimedDeposit.user;

    // Activation happens after the financial transaction commits.
    let activation = null;

    try {
      activation = await activateUserFromDeposit(userIdToActivate);
    } catch (activationError) {
      // The deposit is already committed; do not report the credit as rolled back.
      console.error(
        "Deposit credited, but account activation failed:",
        activationError
      );
    }

    return res.json({
      success: true,
      message: "Deposit verified and credited successfully.",
      depositId: String(claimedDeposit._id),
      amount: claimedDeposit.amount,
      txHash: claimedDeposit.txHash,
      confirmations: verification.confirmations,
      activation,
    });
  } catch (error) {
    if (transactionStarted) {
      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error("Deposit transaction abort failed:", abortError);
      }
    }

    if (
      error.message === "DEPOSIT_ALREADY_REVIEWED" ||
      error.message === "DEPOSIT_WALLET_NOT_FOUND"
    ) {
      return res.status(409).json({
        success: false,
        message:
          error.message === "DEPOSIT_ALREADY_REVIEWED"
            ? "This deposit was already reviewed or credited."
            : "The wallet linked to this deposit could not be found.",
      });
    }

    console.error("Admin deposit approval failed:", error);

    return res.status(500).json({
      success: false,
      message: "Deposit approval failed. No successful credit was confirmed.",
    });
  } finally {
    await session.endSession();
  }
};

// POST /api/admin/deposits/:id/reject
export const rejectManualDeposit = async (req, res) => {
  try {
    const { id } = req.params;
    const reason = String(req.body?.reason || "").trim();

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid deposit ID.",
      });
    }

    if (!reason || reason.length > 500) {
      return res.status(400).json({
        success: false,
        message: "Provide a rejection reason of 1–500 characters.",
      });
    }

    const deposit = await Deposit.findOneAndUpdate(
      {
        _id: id,
        status: { $in: ["PENDING", "UNDER_REVIEW"] },
        creditedAt: null,
      },
      {
        $set: {
          status: "REJECTED",
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
          rejectionReason: reason,
        },
      },
      { new: true }
    );

    if (!deposit) {
      return res.status(409).json({
        success: false,
        message: "Deposit not found, already reviewed, or already credited.",
      });
    }

    return res.json({
      success: true,
      message: "Deposit rejected.",
      depositId: String(deposit._id),
      status: deposit.status,
    });
  } catch (error) {
    console.error("Admin deposit rejection failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to reject deposit.",
    });
  }
};