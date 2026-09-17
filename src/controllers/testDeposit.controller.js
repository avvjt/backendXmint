import Wallet from "../models/wallet.model.js";
import Deposit from "../models/deposit.model.js";
import Transaction from "../models/transaction.model.js";
import activateUserFromDeposit from "../utils/activateUserFromDeposit.js";

const testDeposit = async (req, res) => {
  try {
    const {
      txHash = "0xTEST_DEPOSIT_" + Date.now(),
      amount = 10,
    } = req.body;

    const depositAddress =
      "0x537d18cd385afa8cd8d432d3bfdd5cf8b40f7952";

    const wallet = await Wallet.findOne({
      depositAddress: {
        $regex: `^${depositAddress}$`,
        $options: "i",
      },
      asset: "USDT",
      network: "BEP20",
    });

    if (!wallet) {
      return res.status(404).json({
        success: false,
        message: "Wallet not found",
      });
    }

    const existingDeposit = await Deposit.findOne({ txHash });

    if (existingDeposit) {
      return res.status(200).json({
        success: true,
        message: "Test deposit already exists",
      });
    }

    const deposit = await Deposit.create({
      user: wallet.user,
      wallet: wallet._id,
      asset: "USDT",
      network: "BEP20",
      depositAddress: wallet.depositAddress,
      amount: Number(amount),
      txHash,
      status: "CONFIRMED",
      confirmations: 0,
      confirmedAt: new Date(),
      creditedAt: new Date(),
    });

    await Wallet.updateOne(
      { _id: wallet._id },
      { $inc: { availableBalance: Number(amount) } }
    );

    await Transaction.create({
      user: wallet.user,
      wallet: wallet._id,
      type: "DEPOSIT",
      asset: "USDT",
      network: "BEP20",
      amount: Number(amount),
      status: "COMPLETED",
      referenceId: deposit._id,
      txHash,
      description: "Development test deposit",
    });

    const activation = await activateUserFromDeposit(wallet.user);

    return res.status(200).json({
      success: true,
      message: "TEST DEPOSIT SUCCESSFUL",
      deposit: {
        amount: Number(amount),
        txHash,
        depositAddress: wallet.depositAddress,
      },
      activation,
    });
  } catch (error) {
    console.error("Test deposit error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export default testDeposit;