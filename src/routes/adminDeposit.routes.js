
import express from "express";
import protect from "../middlewares/auth.middleware.js";
import adminOnly from "../middlewares/admin.middleware.js";

import {
  getAdminDeposits,
  approveManualDeposit,
  rejectManualDeposit,
} from "../controllers/adminDeposit.controller.js";

const router = express.Router();

router.get(
  "/admin/deposits",
  protect,
  adminOnly,
  getAdminDeposits
);

router.post(
  "/admin/deposits/:id/approve",
  protect,
  adminOnly,
  approveManualDeposit
);

router.post(
  "/admin/deposits/:id/reject",
  protect,
  adminOnly,
  rejectManualDeposit
);

export default router;