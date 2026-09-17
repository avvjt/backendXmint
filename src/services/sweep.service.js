import { ethers } from "ethers";

/**
 * Derive the private key for a Tatum BSC HD-wallet index.
 *
 * IMPORTANT:
 * - Never log the mnemonic.
 * - Never log the private key.
 * - Never return the private key from an API controller.
 */
const deriveSweepPrivateKey = async (index) => {
  const mnemonic = process.env.TATUM_BSC_MNEMONIC;
  const apiKey = process.env.TATUM_API_KEY;

  if (!mnemonic) {
    throw new Error("TATUM_BSC_MNEMONIC is not configured");
  }

  if (!apiKey) {
    throw new Error("TATUM_API_KEY is not configured");
  }

  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid wallet index");
  }

  const response = await fetch(
    "https://api.tatum.io/v3/bsc/wallet/priv",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        index,
        mnemonic,
      }),
    }
  );

  const data = await response.json();

  if (!response.ok || !data.key) {
    console.error("Private key derivation failed:", {
      status: response.status,
      data,
    });

    throw new Error("Failed to derive BSC private key");
  }

  // NEVER log or return this key from a controller.
  return data.key;
};

const compareTatumXpub = async () => {
  const mnemonic = process.env.TATUM_BSC_MNEMONIC;
  const apiKey = process.env.TATUM_API_KEY;
  const configuredXpub = process.env.TATUM_BSC_XPUB;

  if (!mnemonic) {
    throw new Error("TATUM_BSC_MNEMONIC is not configured");
  }

  if (!apiKey) {
    throw new Error("TATUM_API_KEY is not configured");
  }

  if (!configuredXpub) {
    throw new Error("TATUM_BSC_XPUB is not configured");
  }

  const response = await fetch(
  `https://api.tatum.io/v3/bsc/wallet?mnemonic=${encodeURIComponent(
    mnemonic
  )}`,
  {
    method: "GET",
    headers: {
      "x-api-key": apiKey,
    },
  }
);

  const data = await response.json();

  if (!response.ok || !data.xpub) {
    console.error("Tatum wallet verification failed:", {
      status: response.status,
      data,
    });

    throw new Error(
      data?.message ||
        data?.error ||
        `Tatum wallet verification failed (${response.status})`
    );
  }

  return {
    success: true,

    configuredXpubMatches:
      configuredXpub === data.xpub,

    configuredXpubPrefix:
      configuredXpub.slice(0, 16) + "...",

    generatedXpubPrefix:
      data.xpub.slice(0, 16) + "...",
  };
};

/**
 * Sweep USDT from a user's deposit wallet
 * to the client's treasury wallet.
 */
const sweepUsdt = async ({
  index,
  amount,
}) => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid wallet index");
  }

  if (amount === undefined || amount === null) {
    throw new Error("Sweep amount is required");
  }

  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw new Error("Invalid sweep amount");
  }

  const toAddress =
    process.env.CLIENT_TREASURY_BSC_ADDRESS;

  if (!toAddress) {
    throw new Error(
      "CLIENT_TREASURY_BSC_ADDRESS is not configured"
    );
  }

  if (!ethers.isAddress(toAddress)) {
    throw new Error(
      "CLIENT_TREASURY_BSC_ADDRESS is invalid"
    );
  }

  const contractAddress =
    process.env.BSC_USDT_MAINNET_CONTRACT ||
    "0x55d398326f99059ff775485246999027b3197955";

  if (!ethers.isAddress(contractAddress)) {
    throw new Error(
      "BSC_USDT_MAINNET_CONTRACT is invalid"
    );
  }

  const rpcUrl =
  process.env.BSC_MAINNET_RPC;

if (!rpcUrl) {
  throw new Error(
    "BSC_MAINNET_RPC is not configured"
  );
}

  /*
   * Derive the private key internally.
   * It never gets returned to the caller.
   */
  const privateKey =
    await deriveSweepPrivateKey(index);

  /*
   * Connect to BSC Mainnet.
   */
  const provider =
    new ethers.JsonRpcProvider(rpcUrl);

  /*
   * Create the signing wallet.
   */
  const signer =
    new ethers.Wallet(
      privateKey,
      provider
    );

  /*
   * USDT contract.
   *
   * BSC USDT:
   * 0x55d398326f99059ff775485246999027b3197955
   */
  const usdtAbi = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const usdt =
    new ethers.Contract(
      contractAddress,
      usdtAbi,
      signer
    );

  /*
   * Verify the derived address.
   */
  const fromAddress =
    await signer.getAddress();

  console.log(
    `Preparing USDT sweep from ${fromAddress} to ${toAddress}`
  );

  /*
   * Get USDT decimals directly from the contract.
   *
   * BSC USDT currently uses 18 decimals.
   */
  const decimals =
    await usdt.decimals();

  /*
   * Convert human-readable amount:
   *
   * 10 USDT
   * ->
   * 10000000000000000000
   */
  const tokenAmount =
    ethers.parseUnits(
      String(amount),
      decimals
    );

  /*
   * Check USDT balance.
   */
  const usdtBalance =
    await usdt.balanceOf(
      fromAddress
    );

  if (usdtBalance < tokenAmount) {
    throw new Error(
      `Insufficient USDT balance. ` +
      `Address ${fromAddress} has ` +
      `${ethers.formatUnits(usdtBalance, decimals)} USDT`
    );
  }

  /*
   * Check native BNB balance for gas.
   */
  const bnbBalance =
    await provider.getBalance(
      fromAddress
    );

  if (bnbBalance === 0n) {
    throw new Error(
      `Insufficient BNB for gas. ` +
      `Address ${fromAddress} has no BNB`
    );
  }

  console.log(
    `Sending ${String(amount)} USDT`
  );

  /*
   * Send USDT.
   */
  const tx =
    await usdt.transfer(
      toAddress,
      tokenAmount
    );

  console.log(
    `USDT sweep transaction submitted: ${tx.hash}`
  );

  /*
   * Wait for blockchain confirmation.
   */
  const receipt =
    await tx.wait();

  if (!receipt) {
    throw new Error(
      "Transaction receipt was not returned"
    );
  }

  /*
   * Successful sweep.
   */
  return {
    success: true,
    txHash: tx.hash,
    from: fromAddress,
    to: toAddress,
    amount: String(amount),
    decimals: Number(decimals),
    blockNumber: receipt.blockNumber,
  };
};

const checkSweepWallet = async (index) => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid wallet index");
  }

  const rpcUrl = process.env.BSC_MAINNET_RPC;

  if (!rpcUrl) {
    throw new Error("BSC_MAINNET_RPC is not configured");
  }

  const contractAddress =
    process.env.BSC_USDT_MAINNET_CONTRACT ||
    "0x55d398326f99059ff775485246999027b3197955";

  const privateKey =
    await deriveSweepPrivateKey(index);

  const provider =
    new ethers.JsonRpcProvider(rpcUrl);

  const signer =
    new ethers.Wallet(
      privateKey,
      provider
    );

  const address =
    await signer.getAddress();

  const usdtAbi = [
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)",
  ];

  const usdt =
    new ethers.Contract(
      contractAddress,
      usdtAbi,
      provider
    );

  const decimals =
    await usdt.decimals();

  const usdtBalance =
    await usdt.balanceOf(address);

  const bnbBalance =
    await provider.getBalance(address);

  return {
    success: true,
    address,
    usdtBalance:
      ethers.formatUnits(
        usdtBalance,
        decimals
      ),
    bnbBalance:
      ethers.formatEther(bnbBalance),
  };
};

const compareTatumWalletAddress = async (index) => {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Invalid wallet index");
  }

  const apiKey = process.env.TATUM_API_KEY;
  const xpub = process.env.TATUM_BSC_XPUB;

  if (!apiKey) {
    throw new Error("TATUM_API_KEY is not configured");
  }

  if (!xpub) {
    throw new Error("TATUM_BSC_XPUB is not configured");
  }

  // 1. Address generated from XPUB
  const addressResponse = await fetch(
    `https://api.tatum.io/v3/bsc/address/${encodeURIComponent(
      xpub
    )}/${index}`,
    {
      headers: {
        "x-api-key": apiKey,
      },
    }
  );

  const addressData = await addressResponse.json();

  if (!addressResponse.ok || !addressData.address) {
    throw new Error(
      "Failed to generate address from XPUB"
    );
  }

  // 2. Private key generated from mnemonic
  const privateKey =
    await deriveSweepPrivateKey(index);

  // 3. Convert private key -> Ethereum/BSC address
  const wallet =
    new ethers.Wallet(privateKey);

  const privateKeyAddress =
    wallet.address;

  return {
    success: true,
    index,

    xpubAddress:
      addressData.address,

    privateKeyAddress,

    matches:
      addressData.address.toLowerCase() ===
      privateKeyAddress.toLowerCase(),
  };
};

const getXpubFromMnemonic = async () => {
  const mnemonic = process.env.TATUM_BSC_MNEMONIC;
  const apiKey = process.env.TATUM_API_KEY;

  if (!mnemonic) {
    throw new Error("TATUM_BSC_MNEMONIC is not configured");
  }

  if (!apiKey) {
    throw new Error("TATUM_API_KEY is not configured");
  }

  const response = await fetch(
    `https://api.tatum.io/v3/bsc/wallet?mnemonic=${encodeURIComponent(
      mnemonic
    )}`,
    {
      method: "GET",
      headers: {
        "x-api-key": apiKey,
      },
    }
  );

  const data = await response.json();

  if (!response.ok || !data.xpub) {
    console.error("Tatum XPUB generation failed:", {
      status: response.status,
      data,
    });

    throw new Error(
      data?.message ||
        data?.error ||
        "Failed to generate XPUB"
    );
  }

  return data.xpub;
};



export {
  deriveSweepPrivateKey,
  compareTatumXpub,
  sweepUsdt,
  checkSweepWallet,
  compareTatumWalletAddress,
  getXpubFromMnemonic,
  

};