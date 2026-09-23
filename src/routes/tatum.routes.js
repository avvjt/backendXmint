import express from "express";

import {
  testTatumConnection,
  generateBscAddress,
} from "../controllers/tatum.controller.js";
import {
  checkSweepWallet,
} from "../services/sweep.service.js";

const router = express.Router();

// Development: test Tatum API connection
router.get(
  "/dev/tatum-test",
  testTatumConnection
);

// Development: generate/check a BSC address
router.post(
  "/dev/tatum-address",
  generateBscAddress
);

router.get(
  "/dev/check-sweep-wallet/:index",
  async (req, res) => {
    try {
      const index = Number(req.params.index);

      const result = await checkSweepWallet(index);

      return res.json(result);
    } catch (error) {
      console.error("Check sweep wallet error:", error);

      return res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
);

export default router;