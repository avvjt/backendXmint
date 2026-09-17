import express from "express";
import {
  testTatumConnection,
  generateBscAddress,
  generateBscWallet,
  testSweepAddress,
} from "../controllers/tatum.controller.js";

const router = express.Router();

router.get("/dev/tatum-test", testTatumConnection);
router.post("/dev/tatum-address", generateBscAddress);
router.get("/dev/tatum-new-wallet", generateBscWallet);
router.get("/dev/test-sweep-address", testSweepAddress);

export default router;