import express from "express";
import protect from "../middlewares/auth.middleware.js";
import { submitManualDeposit } from "../controllers/deposit.controller.js";

const router = express.Router();

router.post("/deposits/manual", protect, submitManualDeposit);

export default router;