import express from 'express';
import { register, login, googleLogin, getMe } from '../controllers/authController.js';
import protect from "../middlewares/auth.middleware.js"


const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/google', googleLogin);
router.get("/me", protect, getMe);

router.get('/profile', protect, async (req, res) => {
    res.status(200).json({ message: 'Profile retrieved successfully', user: req.user });
});

export default router;