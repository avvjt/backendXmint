import express from "express";

import {
  getWallet,
  getDeposits,
  getTransactions,
} from "../controllers/wallet.controller.js";

import protect from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/wallet", protect, getWallet);

router.get("/wallet/deposits", protect, getDeposits);

router.get("/wallet/transactions", protect, getTransactions);

export default router;