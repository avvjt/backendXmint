import { ethers } from "ethers";

const BSC_TESTNET_RPC =
  process.env.BSC_TESTNET_RPC ||
  "https://bsc-testnet.gateway.tatum.io";

const TUSDT_CONTRACT =
  process.env.BSC_USDT_TESTNET_CONTRACT;

const WITHDRAWAL_PRIVATE_KEY =
  process.env.BSC_WITHDRAWAL_PRIVATE_KEY;

const TUSDT_ABI = [
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

const sendBep20Usdt = async ({
  destinationAddress,
  amount,
}) => {
  if (!WITHDRAWAL_PRIVATE_KEY) {
    throw new Error("BSC withdrawal signer is not configured");
  }

  if (!TUSDT_CONTRACT) {
    throw new Error("USDT contract is not configured");
  }

  if (!ethers.isAddress(destinationAddress)) {
    throw new Error("Invalid destination address");
  }

  const provider = new ethers.JsonRpcProvider(
    BSC_TESTNET_RPC
  );

  const signer = new ethers.Wallet(
    WITHDRAWAL_PRIVATE_KEY,
    provider
  );

  const tokenContract = new ethers.Contract(
    TUSDT_CONTRACT,
    TUSDT_ABI,
    signer
  );

  const decimals = await tokenContract.decimals();

  const tokenAmount = ethers.parseUnits(
    String(amount),
    decimals
  );

  console.log("Sending BEP20 token:", {
    from: signer.address,
    to: destinationAddress,
    amount: String(amount),
    contract: TUSDT_CONTRACT,
  });

  const transaction = await tokenContract.transfer(
    destinationAddress,
    tokenAmount
  );

  console.log("Blockchain transaction submitted:", {
    txHash: transaction.hash,
  });

  const receipt = await transaction.wait();

  if (!receipt || receipt.status !== 1) {
    throw new Error("Blockchain transaction failed");
  }

  return {
    txHash: transaction.hash,
    blockNumber: receipt.blockNumber,
  };
};

export default sendBep20Usdt;