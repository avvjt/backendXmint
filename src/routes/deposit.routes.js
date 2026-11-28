
import express from "express";
import protect from "../middlewares/auth.middleware.js";

import {
  submitManualDeposit,
  getMyDeposits,
} from "../controllers/deposit.controller.js";

const router = express.Router();

router.post(
  "/deposits/manual",
  protect,
  submitManualDeposit
);

router.get(
  "/deposits/history",
  protect,
  getMyDeposits
);

export default router;
