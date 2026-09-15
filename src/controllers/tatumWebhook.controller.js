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
    // --------------------------------------------------
    // 1. VERIFY TATUM HMAC
    // --------------------------------------------------

    const receivedHash = req.headers["x-payload-hash"];
    const secret = process.env.TATUM_WEBHOOK_SECRET;

    if (!secret) {
      console.error("TATUM_WEBHOOK_SECRET is not configured.");

      return res.status(500).json({
        success: false,
        message: "Webhook security is not configured",
      });
    }

    if (!receivedHash) {
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
      console.warn("Invalid Tatum webhook signature.");

      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    // --------------------------------------------------
    // 2. GET ENRICHED PAYLOAD
    // --------------------------------------------------

    const data = req.body?.data;

    console.log("TATUM WEBHOOK BODY:", JSON.stringify(req.body, null, 2));

    if (!data) {
      console.log("Tatum webhook has no data object.");
      return res.status(200).json({
        success: true,
        message: "Webhook received but no transaction data"
      });
    }

    console.log("========== VERIFIED TATUM WEBHOOK ==========");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("=============================================");

    // --------------------------------------------------
    // 3. EXTRACT TRANSACTION DATA
    // --------------------------------------------------

    const txHash = data.txId.toLowerCase();
    const fromAddress = data.from;
    const toAddress = data.to;
    const contractAddress = data.contractAddress;
    const rawValue = data.value;

    if (!txHash || !toAddress || !contractAddress || rawValue === undefined) {
      console.warn("Incomplete Tatum transaction payload.");

      return res.status(200).json({
        success: true,
        message: "Webhook received but transaction data is incomplete",
      });
    }

    // --------------------------------------------------
    // 4. VERIFY CONTRACT
    // --------------------------------------------------

    if (
      contractAddress.toLowerCase() !==
      TATUM_USDT_TESTNET_CONTRACT.toLowerCase()
    ) {
      console.warn("Ignoring unknown token contract:", contractAddress);

      return res.status(200).json({
        success: true,
        message: "Token contract not supported",
      });
    }

    // --------------------------------------------------
    // 5. FIND USER WALLET
    // --------------------------------------------------

    const wallet = await Wallet.findOne({
      depositAddress: toAddress.toLowerCase(),
      asset: "USDT",
      network: "BEP20"
    });

    if (!wallet) {
      console.warn("No wallet found for deposit address:", toAddress);

      return res.status(200).json({
        success: true,
        message: "Deposit address not found",
      });
    }

    // --------------------------------------------------
    // 6. CHECK DUPLICATE TRANSACTION
    // --------------------------------------------------

    const existingDeposit = await Deposit.findOne({
      txHash,
    });

    if (existingDeposit) {
      console.log("Duplicate deposit ignored:", txHash);

      return res.status(200).json({
        success: true,
        message: "Deposit already processed",
      });
    }

    // --------------------------------------------------
    // 7. CONVERT TOKEN AMOUNT
    // --------------------------------------------------

    const amount = Number(rawValue);

    if (!Number.isFinite(amount) || amount <= 0) {
      console.warn("Invalid deposit amount:", rawValue);

      return res.status(200).json({
        success: true,
        message: "Invalid deposit amount",
      });
    }

    // --------------------------------------------------
    // 8. ATOMIC DATABASE TRANSACTION
    // --------------------------------------------------

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

      console.log("Deposit successfully credited:", {
        user: wallet.user,
        wallet: wallet._id,
        amount,
        txHash,
        fromAddress,
        toAddress,
      });
    } catch (transactionError) {
      await session.abortTransaction();

      // Another webhook could have processed the same txHash
      // at almost exactly the same time.
      if (transactionError?.code === 11000) {
        console.log("Duplicate transaction prevented:", txHash);

        return res.status(200).json({
          success: true,
          message: "Deposit already processed",
        });
      }

      throw transactionError;
    } finally {
      await session.endSession();
    }

    // --------------------------------------------------
    // 9. CHECK ACCOUNT ACTIVATION
    // --------------------------------------------------

    const activation = await activateUserFromDeposit(wallet.user);

    console.log("Deposit activation result:", activation);

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
    console.error("Tatum webhook processing error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

export { tatumWebhook };