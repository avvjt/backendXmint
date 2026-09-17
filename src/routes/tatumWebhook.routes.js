import express from "express";
import { tatumWebhook } from "../controllers/tatumWebhook.controller.js";
import testDeposit from "../controllers/testDeposit.controller.js";


const router = express.Router();

router.post("/webhooks/tatum", tatumWebhook);
router.post("/dev/test-tatum-webhook", tatumWebhook);
// TEMPORARY DEVELOPMENT TEST
router.post("/dev/test-deposit", testDeposit);

export default router;