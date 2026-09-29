import "dotenv/config";
import { ensureGas } from "./src/utils/gasFunding.js";

const depositAddress =
  "0xaD9feBc0d66b13e2D56940f8778BB4e693054987";

try {
  const result = await ensureGas(depositAddress);

  console.log("\n=== Gas Funding Test ===");
  console.log(result);
} catch (error) {
  console.error("\nGas funding failed:");
  console.error(error.message);
}