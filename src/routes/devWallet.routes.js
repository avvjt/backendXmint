import express from "express";
import {
  creditTestBalance,
} from "../controllers/devWallet.controller.js";
import protect from "../middlewares/auth.middleware.js";

const router = express.Router();

router.post(
  "/dev/wallet/credit",
  protect,
  creditTestBalance
);

export default router;