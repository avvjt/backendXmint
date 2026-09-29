
const RPC_URL = process.env.BSC_MAINNET_RPC;
const DEPOSIT_ADDRESS = process.env.CLIENT_TREASURY_BSC_ADDRESS;
const USDT_CONTRACT = process.env.BSC_USDT_MAINNET_CONTRACT;

const REQUIRED_CONFIRMATIONS = Math.max(
  1,
  Number.parseInt(process.env.BSC_REQUIRED_CONFIRMATIONS || "12", 10) || 12
);

const USDT_DECIMALS = 18;

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

const normalizeAddress = (address) =>
  typeof address === "string" ? address.toLowerCase() : "";

const toTokenUnits = (value) => {
  const amount = String(value).trim();

  if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) {
    throw new Error("Invalid USDT amount.");
  }

  const [whole, fraction = ""] = amount.split(".");

  return (
    BigInt(whole) * 10n ** BigInt(USDT_DECIMALS) +
    BigInt(fraction.padEnd(USDT_DECIMALS, "0"))
  );
};

const formatTokenUnits = (units) => {
  const base = 10n ** BigInt(USDT_DECIMALS);
  const whole = units / base;
  const fraction = (units % base)
    .toString()
    .padStart(USDT_DECIMALS, "0")
    .replace(/0+$/, "");

  return fraction ? `${whole}.${fraction}` : whole.toString();
};

const rpc = async (method, params = []) => {
  if (!RPC_URL) {
    throw new Error("BSC_MAINNET_RPC is not configured.");
  }

  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method,
      params,
    }),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`BSC RPC returned HTTP ${response.status}.`);
  }

  const data = await response.json();

  if (data.error || !Object.hasOwn(data, "result")) {
    throw new Error(
      data.error?.message || `BSC RPC failed for ${method}.`
    );
  }

  return data.result;
};

/**
 * Verifies a USDT BEP20 transfer on BNB Smart Chain mainnet.
 *
 * This function does not approve deposits, modify MongoDB, or credit wallets.
 * Call it again immediately before admin approval.
 */
export const verifyBscUsdtDeposit = async ({ txHash, amount }) => {
  try {
    if (!RPC_URL) {
      return {
        valid: false,
        retryable: false,
        reason: "BSC_MAINNET_RPC is not configured.",
      };
    }

    if (
      !ADDRESS_REGEX.test(DEPOSIT_ADDRESS || "") ||
      !ADDRESS_REGEX.test(USDT_CONTRACT || "")
    ) {
      return {
        valid: false,
        retryable: false,
        reason: "The deposit address or USDT contract configuration is invalid.",
      };
    }

    if (!HASH_REGEX.test(String(txHash || ""))) {
      return {
        valid: false,
        retryable: false,
        reason: "Invalid transaction hash.",
      };
    }

    const expectedUnits = toTokenUnits(amount);

    if (expectedUnits <= 0n) {
      return {
        valid: false,
        retryable: false,
        reason: "Deposit amount must be greater than zero.",
      };
    }

    // Ensure this RPC is connected to BNB Smart Chain mainnet (chain ID 56).
    const chainId = await rpc("eth_chainId");

    if (BigInt(chainId) !== 56n) {
      return {
        valid: false,
        retryable: false,
        reason: "RPC endpoint is not connected to BNB Smart Chain mainnet.",
      };
    }

    const normalizedHash = txHash.toLowerCase();

    const [transaction, receipt] = await Promise.all([
      rpc("eth_getTransactionByHash", [normalizedHash]),
      rpc("eth_getTransactionReceipt", [normalizedHash]),
    ]);

    if (!transaction || !receipt) {
      return {
        valid: false,
        pending: true,
        retryable: true,
        confirmations: 0,
        reason: "Transaction has not been mined yet.",
      };
    }

    if (transaction.hash?.toLowerCase() !== normalizedHash) {
      return {
        valid: false,
        reason: "Transaction hash does not match the requested transaction.",
      };
    }

    if (receipt.transactionHash?.toLowerCase() !== normalizedHash) {
      return {
        valid: false,
        reason: "Transaction receipt hash mismatch.",
      };
    }

    if (receipt.status !== "0x1") {
      return {
        valid: false,
        reason: "Transaction failed on-chain.",
      };
    }

    const blockNumber = Number(BigInt(receipt.blockNumber));

    if (!Number.isSafeInteger(blockNumber) || blockNumber < 0) {
      return {
        valid: false,
        retryable: true,
        reason: "Invalid transaction block number.",
      };
    }

    const currentBlockHex = await rpc("eth_blockNumber");
    const currentBlock = Number(BigInt(currentBlockHex));

    if (currentBlock < blockNumber) {
      return {
        valid: false,
        retryable: true,
        reason: "Transaction block is not yet available at the chain head.",
      };
    }

    const confirmations = currentBlock - blockNumber + 1;

    // Find USDT Transfer events whose recipient is the configured treasury.
    const expectedRecipientTopic =
      "0x" +
      DEPOSIT_ADDRESS.slice(2).toLowerCase().padStart(64, "0");

    const matchingTransfers = (receipt.logs || []).filter((log) => {
      const topics = log.topics || [];

      return (
        normalizeAddress(log.address) === normalizeAddress(USDT_CONTRACT) &&
        topics.length >= 3 &&
        String(topics[0]).toLowerCase() === TRANSFER_TOPIC &&
        String(topics[2]).toLowerCase() === expectedRecipientTopic
      );
    });

    if (matchingTransfers.length === 0) {
      return {
        valid: false,
        blockNumber,
        confirmations,
        reason: "No matching USDT transfer to the configured treasury was found.",
      };
    }

    let actualUnits = 0n;

    const transfers = matchingTransfers.map((log) => {
      if (!/^0x[0-9a-fA-F]{64}$/.test(log.data || "")) {
        throw new Error("Invalid USDT transfer event data.");
      }

      if (!/^0x[0-9a-fA-F]{64}$/.test(log.topics[1] || "")) {
        throw new Error("Invalid USDT sender address in transfer event.");
      }

      const transferUnits = BigInt(log.data);
      actualUnits += transferUnits;

      return {
        from: "0x" + log.topics[1].slice(-40).toLowerCase(),
        amount: formatTokenUnits(transferUnits),
        logIndex: Number(BigInt(log.logIndex)),
      };
    });

    if (actualUnits !== expectedUnits) {
      return {
        valid: false,
        blockNumber,
        confirmations,
        reason: "On-chain USDT amount does not match the submitted amount.",
        verifiedAmount: formatTokenUnits(actualUnits),
      };
    }

    if (confirmations < REQUIRED_CONFIRMATIONS) {
      return {
        valid: false,
        pending: true,
        retryable: true,
        blockNumber,
        confirmations,
        requiredConfirmations: REQUIRED_CONFIRMATIONS,
        verifiedAmount: formatTokenUnits(actualUnits),
        transfers,
        reason: "Waiting for the required block confirmations.",
      };
    }

    return {
      valid: true,
      blockNumber,
      confirmations,
      requiredConfirmations: REQUIRED_CONFIRMATIONS,
      tokenContract: USDT_CONTRACT.toLowerCase(),
      depositAddress: DEPOSIT_ADDRESS.toLowerCase(),
      verifiedAmount: formatTokenUnits(actualUnits),
      transfers,
      verifiedAt: new Date(),
    };
  } catch (error) {
    console.error("BSC deposit verification failed:", error.message);

    return {
      valid: false,
      retryable: true,
      reason: "Unable to verify the transaction. Please retry later.",
    };
  }
};

export default verifyBscUsdtDeposit;