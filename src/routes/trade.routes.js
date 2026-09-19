import express from "express";

import authMiddleware from "../middlewares/auth.middleware.js";

import {
  createManualTrade,
  createAutoTrade,
  getTradeHistory,
} from "../controllers/trade.controller.js";

const router = express.Router();

/*
|--------------------------------------------------------------------------
| MANUAL TRADE
|--------------------------------------------------------------------------
*/

router.post(
  "/trade/manual",
  authMiddleware,
  createManualTrade
);

/*
|--------------------------------------------------------------------------
| AUTO TRADE
|--------------------------------------------------------------------------
*/

router.post(
  "/trade/auto",
  authMiddleware,
  createAutoTrade
);

/*
|--------------------------------------------------------------------------
| TRADE HISTORY
|--------------------------------------------------------------------------
*/

router.get(
  "/trade/history",
  authMiddleware,
  getTradeHistory
);

export default router;