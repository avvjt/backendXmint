import Wallet from "../models/wallet.model.js";
import getNextWalletIndex from "./getNextWalletIndex.js";

const createWalletForUser = async (userId) => {
  // Check if wallet already exists
  const existingWallet = await Wallet.findOne({
    user: userId,
  });

  if (existingWallet) {
    return existingWallet;
  }

  // Get a unique derivation index
  const addressIndex = await getNextWalletIndex();

  // Generate BSC address from Tatum
  const response = await fetch(
    `https://api.tatum.io/v3/bsc/address/${encodeURIComponent(
      process.env.TATUM_BSC_XPUB
    )}/${addressIndex}`,
    {
      method: "GET",
      headers: {
        "x-api-key": process.env.TATUM_API_KEY,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.address) {
    console.error("Tatum address generation failed:", data);

    throw new Error("Failed to generate BSC deposit address");
  }

  // Create wallet with unique address
  const wallet = await Wallet.create({
    user: userId,
    asset: "USDT",
    network: "BEP20",
    addressIndex,
    depositAddress: data.address,
    availableBalance: 0,
    lockedBalance: 0,
  });

  return wallet;
};

export default createWalletForUser;