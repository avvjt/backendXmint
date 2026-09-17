import express from "express";
import {
  testTatumConnection,
  generateBscAddress,
  generateBscWallet,
  testSweepAddress,
  checkSweepWalletBalance,
  compareTatumWallet,
  verifyTatumXpub,
  getMatchingXpub,
} from "../controllers/tatum.controller.js";

const router = express.Router();

router.get("/dev/tatum-test", testTatumConnection);
router.post("/dev/tatum-address", generateBscAddress);
router.get("/dev/tatum-new-wallet", generateBscWallet);
router.get("/dev/test-sweep-address", testSweepAddress);
router.get(
  "/dev/check-sweep-wallet",
  checkSweepWalletBalance
);
router.get(
  "/dev/compare-tatum-wallet",
  compareTatumWallet
);
router.get(
  "/dev/verify-tatum-xpub",
  verifyTatumXpub
);

router.get(
  "/dev/get-matching-xpub",
  getMatchingXpub
);


export default router;