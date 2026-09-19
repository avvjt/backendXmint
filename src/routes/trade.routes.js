import express from "express";

import authMiddleware from "../middlewares/auth.middleware.js";

import {
  createManualTrade,
} from "../controllers/trade.controller.js";

const router = express.Router();

router.post(
  "/trade/manual",
  authMiddleware,
  createManualTrade
);

export default router;