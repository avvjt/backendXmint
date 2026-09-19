import Wallet from "../models/wallet.model.js";
import getNextWalletIndex from "./getNextWalletIndex.js";

const createWalletForUser = async (userId) => {
  // Check if wallet already exists
  let wallet = await Wallet.findOne({
    user: userId,
  });

  // Existing wallet with a valid deposit address
  if (
    wallet &&
    wallet.addressIndex !== undefined &&
    wallet.addressIndex !== null &&
    wallet.depositAddress
  ) {
    return wallet;
  }

  // --------------------------------------------------
  // REPAIR EXISTING WALLET
  // --------------------------------------------------
  // Important:
  // We keep the existing balance and wallet document.
  // Only generate/store the missing derivation index + address.
  if (wallet) {
    const addressIndex = await getNextWalletIndex();

    const xpub = process.env.TATUM_BSC_XPUB;
    const apiKey = process.env.TATUM_API_KEY;

    if (!xpub || !apiKey) {
      throw new Error(
        "TATUM_BSC_XPUB or TATUM_API_KEY is not configured"
      );
    }

    const response = await fetch(
      `https://api.tatum.io/v3/bsc/address/${encodeURIComponent(
        xpub
      )}/${addressIndex}`,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.address) {
      console.error("Tatum address generation failed:", data);

      throw new Error("Failed to generate BSC deposit address");
    }

    wallet.addressIndex = addressIndex;
    wallet.depositAddress = data.address;

    await wallet.save();

    console.log(
      `Wallet repaired: user=${userId}, index=${addressIndex}, address=${data.address}`
    );

    return wallet;
  }

  // --------------------------------------------------
  // CREATE NEW WALLET
  // --------------------------------------------------

  // Get a unique derivation index
  const addressIndex = await getNextWalletIndex();

  const xpub = process.env.TATUM_BSC_XPUB;
  const apiKey = process.env.TATUM_API_KEY;

  if (!xpub || !apiKey) {
    throw new Error(
      "TATUM_BSC_XPUB or TATUM_API_KEY is not configured"
    );
  }

  // Generate BSC address from Tatum
  const response = await fetch(
    `https://api.tatum.io/v3/bsc/address/${encodeURIComponent(
      xpub
    )}/${addressIndex}`,
    {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.address) {
    console.error("Tatum address generation failed:", data);

    throw new Error("Failed to generate BSC deposit address");
  }

  // Create wallet with unique address
  wallet = await Wallet.create({
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