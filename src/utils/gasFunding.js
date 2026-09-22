import { ethers } from "ethers";

const GAS_LIMIT = 65000n;
const GAS_BUFFER = 2n;

// Maximum BNB the backend may automatically send
// to one deposit address in a single top-up.
const MAX_GAS_TOPUP_BNB = "0.0005";

const getProvider = () => {
  const rpcUrl = process.env.BSC_MAINNET_RPC;

  if (!rpcUrl) {
    throw new Error("BSC_MAINNET_RPC is not configured");
  }

  return new ethers.JsonRpcProvider(rpcUrl);
};

const getGasWallet = (provider) => {
  const privateKey = process.env.GAS_FUNDING_BSC_PRIVATE_KEY;

  if (!privateKey) {
    throw new Error(
      "GAS_FUNDING_BSC_PRIVATE_KEY is not configured"
    );
  }

  return new ethers.Wallet(privateKey, provider);
};

const ensureGas = async (depositAddress) => {
  if (!ethers.isAddress(depositAddress)) {
    throw new Error("Invalid deposit address");
  }

  const configuredGasAddress =
    process.env.GAS_FUNDING_BSC_ADDRESS;

  if (!configuredGasAddress) {
    throw new Error(
      "GAS_FUNDING_BSC_ADDRESS is not configured"
    );
  }

  if (
    !ethers.isAddress(configuredGasAddress)
  ) {
    throw new Error(
      "GAS_FUNDING_BSC_ADDRESS is invalid"
    );
  }

  const provider = getProvider();

  const gasWallet = getGasWallet(provider);

  const actualGasAddress =
    await gasWallet.getAddress();

  if (
    actualGasAddress.toLowerCase() !==
    configuredGasAddress.toLowerCase()
  ) {
    throw new Error(
      "GAS_FUNDING_BSC_ADDRESS does not match GAS_FUNDING_BSC_PRIVATE_KEY"
    );
  }

  /*
   * Current BNB balance of the deposit address.
   */
  const depositBnb =
    await provider.getBalance(depositAddress);

  /*
   * Estimate gas price.
   */
  const feeData =
    await provider.getFeeData();

  const gasPrice =
    feeData.maxFeePerGas ||
    feeData.gasPrice;

  if (!gasPrice) {
    throw new Error(
      "Unable to determine BNB gas price"
    );
  }

  /*
   * Estimate enough BNB for one USDT transfer
   * plus a safety buffer.
   */
  const estimatedGas =
    gasPrice *
    GAS_LIMIT;

  const requiredBnb =
    estimatedGas *
    GAS_BUFFER;

  /*
   * Already enough?
   */
  if (depositBnb >= requiredBnb) {
    return {
      success: true,
      funded: false,
      address: depositAddress,
      bnbBalance:
        ethers.formatEther(depositBnb),
      requiredBnb:
        ethers.formatEther(requiredBnb),
    };
  }

  /*
   * Only send the amount needed to reach
   * the required balance.
   */
  const amountToSend =
    requiredBnb - depositBnb;

    const maxTopup =
  ethers.parseEther(MAX_GAS_TOPUP_BNB);

if (amountToSend > maxTopup) {
  throw new Error(
    `Gas top-up exceeds safety limit. ` +
    `Required ${ethers.formatEther(amountToSend)} BNB, ` +
    `maximum allowed ${MAX_GAS_TOPUP_BNB} BNB`
  );
}

  /*
   * Make sure gas wallet can afford:
   *
   * BNB sent to deposit address
   * +
   * gas wallet transaction fee
   */
  const gasWalletBalance =
    await provider.getBalance(actualGasAddress);

  const gasWalletGas =
    gasPrice * 21000n;

  const totalRequired =
    amountToSend + gasWalletGas;

  if (gasWalletBalance < totalRequired) {
    throw new Error(
      `Gas funding wallet has insufficient BNB. ` +
      `Required approximately ${ethers.formatEther(
        totalRequired
      )} BNB, ` +
      `available ${ethers.formatEther(
        gasWalletBalance
      )} BNB`
    );
  }

  console.log(
    `Funding ${depositAddress} with ` +
      `${ethers.formatEther(amountToSend)} BNB for gas`
  );

  const tx =
    await gasWallet.sendTransaction({
      to: depositAddress,
      value: amountToSend,
    });

  console.log(
    `Gas funding transaction submitted: ${tx.hash}`
  );

  await tx.wait();

  return {
    success: true,
    funded: true,
    address: depositAddress,
    amount:
      ethers.formatEther(amountToSend),
    txHash: tx.hash,
  };
};

export {
    
  ensureGas,
};