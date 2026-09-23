import crypto from "crypto";
import mongoose from "mongoose";

import Wallet from "../models/wallet.model.js";
import Deposit from "../models/deposit.model.js";
import Transaction from "../models/transaction.model.js";
import activateUserFromDeposit from "../utils/activateUserFromDeposit.js";
import { sweepUsdt } from "../services/sweep.service.js";
import { processReferralBonus } from "../services/teamIncome.service.js";
import UserPackage from "../models/userPackage.model.js";
import { getPackageByBalance } from "../config/packageConfig.js";
import { syncTeamLevel } from "../services/team.service.js";



const TATUM_USDT_MAINNET_CONTRACT =
  process.env.BSC_USDT_MAINNET_CONTRACT ||
  "0x55d398326f99059ff775485246999027b3197955";

const tatumWebhook = async (req, res) => {
  try {
    // ==================================================
    // 1. VERIFY HMAC
    // ==================================================

    const receivedHash = req.headers["x-payload-hash"];
    const secret = process.env.TATUM_WEBHOOK_SECRET;

    if (!secret) {
      console.error("TATUM_WEBHOOK_SECRET is missing");

      return res.status(500).json({
        success: false,
        message: "Webhook security is not configured",
      });
    }

    if (!receivedHash) {
      console.warn("Tatum webhook missing x-payload-hash");

      return res.status(401).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    const calculatedHash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("base64");

    const receivedBuffer = Buffer.from(receivedHash);
    const calculatedBuffer = Buffer.from(calculatedHash);

    if (
      receivedBuffer.length !== calculatedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
      console.warn("Invalid Tatum webhook signature");

      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    console.log("========== VERIFIED TATUM WEBHOOK ==========");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("============================================");

    // ==================================================
    // 2. GET TATUM ENRICHED DATA
    // ==================================================

    const data = req.body?.data ?? req.body;

    if (!data) {
      console.log("No data object in Tatum webhook");

      return res.status(200).json({
        success: true,
        message: "Webhook received",
      });
    }

    // ==================================================
    // 3. EXTRACT DATA
    // ==================================================

    const txHash = data.txId;
    const fromAddress = data.from;
    const toAddress = data.to;
    const contractAddress = data.contractAddress;
    const rawValue = data.value;

    if (
      !txHash ||
      !toAddress ||
      !contractAddress ||
      rawValue === undefined
    ) {
      console.warn("Incomplete Tatum transaction payload");

      return res.status(200).json({
        success: true,
        message: "Incomplete transaction data",
      });
    }

    // ==================================================
    // 4. VERIFY TOKEN CONTRACT
    // ==================================================

    if (
      contractAddress.toLowerCase() !==
      TATUM_USDT_MAINNET_CONTRACT.toLowerCase()
    ) {
      return res.status(200).json({
        success: true,
        message: "Unsupported token",
      });
    }

    // ==================================================
    // 5. FIND USER WALLET
    // ==================================================

    // IMPORTANT:
    // Ethereum/BSC addresses are case-insensitive.
    // Do NOT require exact lowercase matching.

    const wallet = await Wallet.findOne({
      depositAddress: {
        $regex: `^${toAddress}$`,
        $options: "i",
      },
      asset: "USDT",
      network: "BEP20",
    });

    if (!wallet) {
      console.warn(
        "No wallet found for deposit address:",
        toAddress
      );

      return res.status(200).json({
        success: true,
        message: "Deposit address not found",
      });
    }

    // ==================================================
    // 6. DUPLICATE CHECK
    // ==================================================

    const existingDeposit = await Deposit.findOne({
      txHash: txHash,
    });

    if (existingDeposit) {
      console.log("Duplicate deposit ignored:", txHash);

      return res.status(200).json({
        success: true,
        message: "Deposit already processed",
      });
    }

    // ==================================================
    // 7. CONVERT TOKEN AMOUNT
    // ==================================================

    const decimals = Number(
      data?.tokenMetadata?.decimals ?? 18
    );

    const numericValue = Number(rawValue);

    const amount =
      String(rawValue).includes(".")
        ? numericValue
        : numericValue / Math.pow(10, decimals);

    if (!Number.isFinite(amount) || amount <= 0) {
      console.warn("Invalid token amount:", {
        rawValue,
        decimals,
        amount,
      });

      return res.status(200).json({
        success: true,
        message: "Invalid deposit amount",
      });
    }

    console.log("USDT deposit detected:", {
      txHash,
      fromAddress,
      toAddress,
      rawValue,
      decimals,
      amount,
    });

    // ==================================================
    // 8. DATABASE TRANSACTION
    // ==================================================

    const session = await mongoose.startSession();

    let createdDepositId = null;
    let referralBonus = null;

    try {
      session.startTransaction();

      const deposit = await Deposit.create(
        [
          {
            user: wallet.user,
            wallet: wallet._id,
            asset: "USDT",
            network: "BEP20",
            depositAddress: wallet.depositAddress,
            amount,
            txHash,
            status: "CONFIRMED",
            confirmations: 0,
            confirmedAt: new Date(),
            creditedAt: new Date(),
          },
        ],
        { session }
      );

      createdDepositId = deposit[0]._id;

      await Wallet.updateOne(
        { _id: wallet._id },
        {
          $inc: {
            availableBalance: amount,
          },
        },
        { session }
      );

      // ==================================================
      // UPDATE USER PACKAGE FROM NEW DEPOSIT
      // ==================================================

      const updatedWallet = await Wallet.findById(
        wallet._id
      ).session(session);

      const packageInfo = getPackageByBalance(
        updatedWallet.availableBalance
      );

      if (packageInfo) {
        let userPackage = await UserPackage.findOne({
          user: wallet.user,
        }).session(session);

        if (!userPackage) {
          userPackage = new UserPackage({
            user: wallet.user,
          });
        }

        const previousPackageKey =
          userPackage.packageKey;

        const previousBaseAmount =
          Number(userPackage.baseAmount || 0);

        /*
         * First eligible deposit:
         * establish the initial earning base.
         *
         * New deposit that upgrades the package:
         * update the base to the new qualifying balance.
         *
         * Deposit that does not change the package:
         * keep the existing base.
         */
        if (
          previousBaseAmount <= 0 ||
          !previousPackageKey ||
          packageInfo.key !== previousPackageKey
        ) {
          userPackage.baseAmount =
            updatedWallet.availableBalance;
        }

        userPackage.packageKey =
          packageInfo.key;

        userPackage.packageName =
          packageInfo.name;

        userPackage.dailyRate =
          packageInfo.dailyRate;

        userPackage.isActive = true;

        await userPackage.save({ session });

        console.log("User package updated:", {
          user: wallet.user,
          previousPackage: previousPackageKey,
          newPackage: packageInfo.key,
          baseAmount: userPackage.baseAmount,
        });
      }

      console.log("STEP 1: Creating Transaction...");

      await Transaction.create(
        [
          {
            user: wallet.user,
            wallet: wallet._id,
            type: "DEPOSIT",
            asset: "USDT",
            network: "BEP20",
            amount,
            status: "COMPLETED",
            referenceId: deposit[0]._id,
            txHash,
            description: "BSC Mainnet USDT deposit",
          },
        ],
        { session }
      );

      console.log("STEP 1 DONE: Transaction created");

      console.log("STEP 2: Processing referral bonus...");

      referralBonus = await processReferralBonus({
        referredUserId: wallet.user,
        depositId: deposit[0]._id,
        depositAmount: amount,
        session,
      });

      console.log("STEP 2 DONE: Referral bonus processed");

      console.log("CHECKPOINT: Testing transaction after referral...");

      await UserPackage.findOne({
        user: wallet.user,
      }).session(session);

      console.log("CHECKPOINT PASSED: Transaction is still active");

      console.log("STEP 3: Syncing team level...");

      await syncTeamLevel(
        wallet.user,
        session
      );

      console.log("STEP 3 DONE: Team level synced");

      console.log("STEP 4: Committing transaction...");

      await session.commitTransaction();

      console.log("STEP 4 DONE: Transaction committed");

      console.log("=================================");
      console.log("DEPOSIT CREDITED SUCCESSFULLY");
      console.log("User:", wallet.user);
      console.log("Amount:", amount, "USDT");
      console.log("TX:", txHash);
      console.log("=================================");
    } catch (transactionError) {
      console.error(
        "========== TRANSACTION ERROR =========="
      );

      console.error(
        "Name:",
        transactionError?.name
      );

      console.error(
        "Message:",
        transactionError?.message
      );

      console.error(
        "Code:",
        transactionError?.code
      );

      console.error(
        "CodeName:",
        transactionError?.codeName
      );

      console.error(
        "Stack:",
        transactionError?.stack
      );

      console.error(
        "========================================"
      );

      try {
        await session.abortTransaction();
      } catch (abortError) {
        console.error(
          "Transaction abort error:",
          abortError?.message
        );
      }

      // Unique txHash protection
      if (transactionError?.code === 11000) {
        console.log(
          "Duplicate transaction prevented:",
          txHash
        );

        return res.status(200).json({
          success: true,
          message: "Deposit already processed",
        });
      }

      throw transactionError;
    } finally {
      await session.endSession();
    }




    // ==================================================
    // 10. AUTOMATIC ACCOUNT ACTIVATION
    // ==================================================

    const activation = await activateUserFromDeposit(
      wallet.user
    );

    console.log(
      "Activation result:",
      activation
    );

    // ==================================================
    // 11. AUTOMATIC USDT SWEEP
    // ==================================================

    let sweep = null;

    try {
      sweep = await sweepUsdt({
        index: wallet.addressIndex,
        amount,
      });

      console.log(
        "USDT sweep completed:",
        sweep.txHash
      );
    } catch (sweepError) {
      console.error(
        "USDT sweep failed:",
        sweepError.message
      );

      sweep = {
        success: false,
        message: sweepError.message,
      };
    }

    // ==================================================
    // 10. SUCCESS
    // ==================================================

    return res.status(200).json({
      success: true,
      message: "Deposit processed successfully",

      deposit: {
        txHash,
        amount,
        depositAddress: wallet.depositAddress,
      },

      activation,
      referralBonus,
      sweep,
    });
  } catch (error) {
    console.error(
      "Tatum webhook processing error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

export { tatumWebhook };