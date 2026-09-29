import "dotenv/config";
import { sweepUsdt } from "./src/services/sweep.service.js";

const depositAddress =
  "0xaD9feBc0d66b13e2D56940f8778BB4e693054987";

const index = 47;

try {
  console.log("Starting direct USDT sweep...");
  console.log("Deposit address:", depositAddress);
  console.log("Index:", index);

  const result = await sweepUsdt({
    index,
    amount: "1.0",
  });

  console.log("\n=== USDT SWEEP RESULT ===");
  console.log(result);
} catch (error) {
  console.error("\n=== USDT SWEEP FAILED ===");
  console.error(error);
}