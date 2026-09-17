import express from "express";
import { tatumWebhook } from "../controllers/tatumWebhook.controller.js";



const router = express.Router();

router.post("/webhooks/tatum", tatumWebhook);

export default router;