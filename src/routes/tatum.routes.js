import express from "express";

import {
  testTatumConnection,
  generateBscAddress,
} from "../controllers/tatum.controller.js";

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

export default router;