import crypto from "crypto";
import mongoose from "mongoose";

import Wallet from "../models/wallet.model.js";
import Deposit from "../models/deposit.model.js";
import Transaction from "../models/transaction.model.js";
import activateUserFromDeposit from "../utils/activateUserFromDeposit.js";

const TATUM_USDT_TESTNET_CONTRACT =
  process.env.BSC_USDT_TESTNET_CONTRACT ||
  "0x337610d27c682E347C9cD60BD4b3b107C9d34dDd";

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

    const data = req.body?.data;

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
      TATUM_USDT_TESTNET_CONTRACT.toLowerCase()
    ) {
      console.warn(
        "Ignoring unsupported token:",
        contractAddress
      );

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

    const amount =
      Number(rawValue) / Math.pow(10, decimals);

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

      await Wallet.updateOne(
        { _id: wallet._id },
        {
          $inc: {
            availableBalance: amount,
          },
        },
        { session }
      );

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
            description: "BSC Testnet USDT deposit",
          },
        ],
        { session }
      );

      await session.commitTransaction();

      console.log("=================================");
      console.log("DEPOSIT CREDITED SUCCESSFULLY");
      console.log("User:", wallet.user);
      console.log("Amount:", amount, "USDT");
      console.log("TX:", txHash);
      console.log("=================================");
    } catch (transactionError) {
      await session.abortTransaction();

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
    // 9. AUTOMATIC ACCOUNT ACTIVATION
    // ==================================================

    const activation = await activateUserFromDeposit(
      wallet.user
    );

    console.log(
      "Activation result:",
      activation
    );

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