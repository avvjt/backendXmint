import "dotenv/config";
import { ethers } from "ethers";

const provider = new ethers.JsonRpcProvider(
  process.env.BSC_MAINNET_RPC
);

const wallet = new ethers.Wallet(
  process.env.GAS_FUNDING_BSC_PRIVATE_KEY,
  provider
);

const derivedAddress = await wallet.getAddress();

const configuredAddress =
  process.env.GAS_FUNDING_BSC_ADDRESS;

const balance =
  await provider.getBalance(derivedAddress);

console.log("\n=== CryptoMintX Gas Wallet ===");

console.log(
  "Derived address:",
  derivedAddress
);

console.log(
  "Configured address:",
  configuredAddress
);

console.log(
  "Addresses match:",
  derivedAddress.toLowerCase() ===
    configuredAddress.toLowerCase()
);

console.log(
  "BNB balance:",
  ethers.formatEther(balance),
  "BNB"
);