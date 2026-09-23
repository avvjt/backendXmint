import crypto from "crypto";
import "dotenv/config";

const WEBHOOK_URL =
  "https://backendxmint.onrender.com/api/webhooks/tatum";

const DEPOSIT_ADDRESS =
  "0x6040758b3a67f35a959b3659e688a2c7a313b0bd";

const TX_HASH =
  `TEST-DEPOSIT-${Date.now()}`;

const payload = {
  data: {
    txId: TX_HASH,

    from:
      "0x1111111111111111111111111111111111111111",

    to: DEPOSIT_ADDRESS,

    contractAddress:
      "0x55d398326f99059ff775485246999027b3197955",

    // 55 USDT with 18 decimals
    value:
      "55000000000000000000",

    tokenMetadata: {
      symbol: "USDT",
      name: "Tether USD",
      decimals: 18,
    },

    chain: "bsc-mainnet",
  },
};

const secret =
  process.env.TATUM_WEBHOOK_SECRET;

if (!secret) {
  throw new Error(
    "TATUM_WEBHOOK_SECRET is missing from .env"
  );
}

const body =
  JSON.stringify(payload);

const signature =
  crypto
    .createHmac("sha512", secret)
    .update(body)
    .digest("base64");

console.log("Sending test webhook...");
console.log("URL:", WEBHOOK_URL);
console.log("TX:", TX_HASH);
console.log("Deposit:", DEPOSIT_ADDRESS);
console.log("Amount: 55 USDT");

const response =
  await fetch(WEBHOOK_URL, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-payload-hash": signature,
    },

    body,
  });

const text =
  await response.text();

console.log("\nHTTP STATUS:", response.status);

console.log(
  "RESPONSE:",
  text
);