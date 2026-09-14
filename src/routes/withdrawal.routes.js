import express from "express";

import {
  createWithdrawal,
  updateWithdrawalStatus,
} from "../controllers/withdrawal.controller.js";

import protect from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post(
  "/withdrawals",
  protect,
  createWithdrawal
);

router.patch(
  "/withdrawals/:withdrawalId/status",
  protect,
  updateWithdrawalStatus
);

export default router;