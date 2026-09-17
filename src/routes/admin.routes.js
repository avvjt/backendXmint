import express from "express";

import {
  getAdminDeposits,
  getAdminWithdrawals,
} from "../controllers/admin.controller.js";

import protect from "../middlewares/auth.middleware.js";
import requireAdmin from "../middlewares/admin.middleware.js";

const router = express.Router();

// Deposits - view only
router.get(
  "/admin/deposits",
  protect,
  requireAdmin,
  getAdminDeposits
);

// Withdrawals - view only
router.get(
  "/admin/withdrawals",
  protect,
  requireAdmin,
  getAdminWithdrawals
);

export default router;