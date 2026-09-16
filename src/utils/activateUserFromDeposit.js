import mongoose from "mongoose";
import User from "../models/user.model.js";
import Deposit from "../models/deposit.model.js";

const activateUserFromDeposit = async (userId) => {
  const minimumDeposit = Number(
    process.env.ACTIVATION_DEPOSIT_MINIMUM || 50
  );

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const result = await Deposit.aggregate([
    {
      $match: {
        user: userObjectId,
        status: "CONFIRMED",
      },
    },
    {
      $group: {
        _id: null,
        totalDeposited: {
          $sum: "$amount",
        },
      },
    },
  ]);

  const totalDeposited =
    result.length > 0
      ? result[0].totalDeposited
      : 0;

  console.log("Activation check:", {
    userId,
    totalDeposited,
    minimumDeposit,
  });

  if (totalDeposited < minimumDeposit) {
    return {
      activated: false,
      totalDeposited,
      minimumDeposit,
    };
  }

  const user = await User.findById(userId);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.accountStatus !== "ACTIVE") {
    user.accountStatus = "ACTIVE";
    user.activatedAt = new Date();

    await user.save();
  }

  return {
    activated: true,
    totalDeposited,
    minimumDeposit,
  };
};

export default activateUserFromDeposit;