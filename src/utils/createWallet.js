import Wallet from "../models/wallet.model.js";

const createWalletForUser = async (userId) => {
  const existingWallet = await Wallet.findOne({
    user: userId,
  });

  if (existingWallet) {
    return existingWallet;
  }

  const wallet = await Wallet.create({
    user: userId,
    asset: "USDT",
    network: "BEP20",
    depositAddress: null,
    availableBalance: 0,
    lockedBalance: 0,
  });

  return wallet;
};

export default createWalletForUser;