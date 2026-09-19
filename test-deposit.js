import crypto from "crypto";
import dotenv from "dotenv";

dotenv.config();

const WEBHOOK_URL =
  "http://localhost:3000/webhooks/tatum";

// Your actual wallet deposit address.
// Use the address belonging to the account you're testing.
const DEPOSIT_ADDRESS =
  "PASTE_YOUR_DEPOSIT_ADDRESS_HERE";

// Fake transaction hash.
// It must be unique every time you run the test.
const TX_HASH =
  `TEST-${Date.now()}`;

// $55 USDT with 18 decimals.
const AMOUNT = "55000000000000000000";

const payload = {
  data: {
    txId: TX_HASH,

    from: "0x0000000000000000000000000000000000000001",

    to: DEPOSIT_ADDRESS,

    contractAddress:
      "0x55d398326f99059ff775485246999027b3197955",

    value: AMOUNT,

    tokenMetadata: {
      symbol: "USDT",
      decimals: 18,
    },
  },
};

const secret =
  process.env.TATUM_WEBHOOK_SECRET;

if (!secret) {
  throw new Error(
    "TATUM_WEBHOOK_SECRET is missing from .env"
  );
}

const body = JSON.stringify(payload);

const signature = crypto
  .createHmac("sha512", secret)
  .update(body)
  .digest("base64");

console.log("Sending test deposit...");
console.log("Amount: 55 USDT");
console.log("TX:", TX_HASH);
console.log("To:", DEPOSIT_ADDRESS);

const response = await fetch(
  WEBHOOK_URL,
  {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
      "x-payload-hash": signature,
    },

    body,
  }
);

const result = await response.json();

console.log("\nStatus:", response.status);
console.log(
  JSON.stringify(result, null, 2)
);