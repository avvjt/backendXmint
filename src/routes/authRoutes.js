import express from 'express';
import { register, login, googleLogin, getMe, forgotPassword, resetPassword, changePassword } from '../controllers/authController.js';
import protect from "../middlewares/auth.middleware.js"
import {
  createTelegramLinkToken,
  completeTelegramLink,
  linkTelegram,
  telegramLogin,
} from "../controllers/telegramAuthController.js";


const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get("/me", protect, getMe);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.get('/profile', protect, async (req, res) => {
    res.status(200).json({ message: 'Profile retrieved successfully', user: req.user });
});
router.patch("/change-password", protect, changePassword);
router.post(
  "/telegram/link-token",
  protect,
  createTelegramLinkToken
);
router.post(
  "/telegram/complete-link",
  completeTelegramLink
);
router.post("/telegram/link", protect, linkTelegram);
router.post("/telegram", telegramLogin);

export default router;