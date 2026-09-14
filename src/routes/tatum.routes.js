import express from "express";
import {
  testTatumConnection,
  generateBscAddress,
} from "../controllers/tatum.controller.js";

const router = express.Router();

router.get("/dev/tatum-test", testTatumConnection);
router.post("/dev/tatum-address", generateBscAddress);

export default router;