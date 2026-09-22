import "dotenv/config";
import { ensureGas } from "./src/utils/gasFunding.js";

const depositAddress =
  "0x6040758b3a67f35a959b3659e688a2c7a313b0bd";

try {
  const result = await ensureGas(depositAddress);

  console.log("\n=== Gas Funding Test ===");
  console.log(result);
} catch (error) {
  console.error("\nGas funding failed:");
  console.error(error.message);
}