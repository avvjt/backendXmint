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

  // NEVER log or return this private key.
  return data.key;
};


const sweepUsdt = async ({
  index,
  amount,
}) => {
  // Derive the signing key internally.
  const privateKey = await deriveSweepPrivateKey(index);

  const toAddress =
    process.env.CLIENT_TREASURY_BSC_ADDRESS;

  const apiKey =
    process.env.TATUM_API_KEY;

  const contractAddress =
    process.env.BSC_USDT_MAINNET_CONTRACT;

  if (!contractAddress) {
    throw new Error(
      "BSC_USDT_MAINNET_CONTRACT is not configured"
    );
  }

  if (!toAddress) {
    throw new Error(
      "CLIENT_TREASURY_BSC_ADDRESS is not configured"
    );
  }

  if (!apiKey) {
    throw new Error(
      "TATUM_API_KEY is not configured"
    );
  }

  if (amount === undefined || amount === null) {
    throw new Error(
      "Sweep amount is required"
    );
  }

  const numericAmount = Number(amount);

  if (
    !Number.isFinite(numericAmount) ||
    numericAmount <= 0
  ) {
    throw new Error(
      "Invalid sweep amount"
    );
  }

  /*
   * IMPORTANT:
   *
   * We are intentionally NOT sending the transaction yet.
   *
   * The private key is successfully derived above,
   * but this function currently only validates the
   * configuration.
   */

  return {
    success: true,
    index,
    amount: String(amount),
    contractAddress,
    toAddress,
    privateKeyReady: Boolean(privateKey),
  };
};


export {
  deriveSweepPrivateKey,
  sweepUsdt,
};