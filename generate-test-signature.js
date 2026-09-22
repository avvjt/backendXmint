import crypto from "crypto";
import "dotenv/config";

const body = {
  data: {
    txId: "TEST-DEPOSIT-B-55-001",
    from: "0x1111111111111111111111111111111111111111",
    to: "0x6040758b3a67f35a959b3659e688a2c7a313b0bd",
    contractAddress: "0x55d398326f99059ff775485246999027b3197955",
    value: "55000000000000000000",
    tokenMetadata: {
      decimals: 18
    }
  }
};

const signature = crypto
  .createHmac("sha512", process.env.TATUM_WEBHOOK_SECRET)
  .update(JSON.stringify(body))
  .digest("base64");

console.log(signature);