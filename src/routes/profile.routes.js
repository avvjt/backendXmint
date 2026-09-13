import express from "express";

import {
  updateProfile,
  uploadAvatar,
  deleteAvatar,
} from "../controllers/profile.controller.js";

import protect from "../middleware/auth.middleware.js";
import upload from "../middleware/upload.middleware.js";

const router = express.Router();

router.patch(
  "/profile",
  protect,
  updateProfile
);

router.post(
  "/profile/avatar",
  protect,
  upload.single("avatar"),
  uploadAvatar
);

router.delete(
  "/profile/avatar",
  protect,
  deleteAvatar
);

export default router;