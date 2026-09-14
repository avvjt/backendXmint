import mongoose from "mongoose";

import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";

const createMissingWallets = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    const users = await User.find({});

    let created = 0;

    for (const user of users) {
      const existingWallet = await Wallet.findOne({
        user: user._id,
      });

      if (existingWallet) {
        continue;
      }

      await Wallet.create({
        user: user._id,
        asset: "USDT",
        network: "BEP20",
        depositAddress: null,
        availableBalance: 0,
        lockedBalance: 0,
      });

      created++;

      console.log(
        `Wallet created for ${user.email}`
      );
    }

    console.log(
      `Finished. Created ${created} wallet(s).`
    );
  } catch (error) {
    console.error(
      "Wallet migration error:",
      error
    );
  } finally {
    await mongoose.disconnect();
  }
};

createMissingWallets();