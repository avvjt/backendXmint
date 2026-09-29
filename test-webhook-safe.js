import crypto from "crypto";
import "dotenv/config";

const WEBHOOK_URL =
  "https://backendxmint.onrender.com/api/webhooks/tatum";

const payload = {
  data: {
    txId: `SAFE-TEST-${Date.now()}`,
    from: "0x1111111111111111111111111111111111111111",
    to: "0x2222222222222222222222222222222222222222",
    value: "1",
    // Deliberately WRONG contract.
    // This guarantees the webhook exits before touching the database.
    contractAddress: "0x0000000000000000000000000000000000000001",
    tokenMetadata: {
      symbol: "TEST",
      decimals: 18,
    },
    chain: "bsc-mainnet",
  },
};

const secret = process.env.TATUM_WEBHOOK_SECRET;

if (!secret) {
  throw new Error("TATUM_WEBHOOK_SECRET is missing");
}

const body = JSON.stringify(payload);

const signature = crypto
  .createHmac("sha512", secret)
  .update(body)
  .digest("base64");

const response = await fetch(WEBHOOK_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-payload-hash": signature,
  },
  body,
});

console.log("HTTP STATUS:", response.status);
console.log("RESPONSE:", await response.text());