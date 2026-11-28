
import express from "express";
import protect from "../middlewares/auth.middleware.js";
import upiUpload from "../middlewares/upiUpload.middleware.js";

import {
  submitManualDeposit,
  getMyDeposits,
  submitUpiDeposit,
} from "../controllers/deposit.controller.js";

const router = express.Router();

// Existing BEP20 deposit
router.post(
  "/deposits/manual",
  protect,
  submitManualDeposit
);

// Existing deposit history
router.get(
  "/deposits/history",
  protect,
  getMyDeposits
);

// New UPI deposit
router.post(
  "/deposits/upi",
  protect,
  upiUpload.single("screenshot"),
  submitUpiDeposit
);

export default router;
