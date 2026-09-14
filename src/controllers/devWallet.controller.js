import Wallet from "../models/wallet.model.js";
import Deposit from "../models/deposit.model.js";
import Transaction from "../models/transaction.model.js";
import activateUserFromDeposit from "../utils/activateUserFromDeposit.js";

const creditTestBalance = async (req, res) => {
  try {
    const { amount } = req.body;

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Amount must be greater than 0",
      });
    }

    const wallet = await Wallet.findOne({
      user: req.user.id,
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    wallet.availableBalance += numericAmount;

    await wallet.save();

    const deposit = await Deposit.create({
      user: req.user.id,
      wallet: wallet._id,
      asset: "USDT",
      network: "BEP20",
      depositAddress:
        wallet.depositAddress || "DEV_TEST_ADDRESS",
      amount: numericAmount,
      txHash: `DEV-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}`,
      status: "CONFIRMED",
      confirmations: 1,
      confirmedAt: new Date(),
      creditedAt: new Date(),
    });

    await Transaction.create({
      user: req.user.id,
      wallet: wallet._id,
      type: "DEPOSIT",
      asset: "USDT",
      network: "BEP20",
      amount: numericAmount,
      status: "COMPLETED",
      referenceId: deposit._id,
      description: "Development test deposit",
    });

    const activation = await activateUserFromDeposit(
  req.user.id
);

    return res.status(200).json({
  success: true,
  message: "Test balance credited successfully",
  balance: wallet.availableBalance,
  activation,
});
  } catch (error) {
    console.error("Test wallet credit error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to credit test balance",
    });
  }
};

export { creditTestBalance };