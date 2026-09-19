import express from "express";
import {
  getTeam,
  getMembers,
} from "../controllers/team.controller.js";
import authMiddleware from "../middlewares/auth.middleware.js";

const router = express.Router();

router.get("/team", authMiddleware, getTeam);

router.get(
  "/team/members",
  authMiddleware,
  getMembers
);

export default router;