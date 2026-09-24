import crypto from "crypto";
import jwt from "jsonwebtoken";
import User from "../models/user.model.js";

const getTelegramData = (initData) => {
    if (!initData || typeof initData !== "string") {
        throw new Error("Telegram initData is required");
    }

    const params = new URLSearchParams(initData);

    const receivedHash = params.get("hash");

    if (!receivedHash) {
        throw new Error("Telegram hash is missing");
    }

    params.delete("hash");

    const dataCheckString = [...params.entries()]
        .sort(([keyA], [keyB]) => keyA.localeCompare(keyB))
        .map(([key, value]) => `${key}=${value}`)
        .join("\n");

    const secretKey = crypto
        .createHmac("sha256", "WebAppData")
        .update(process.env.BOT_TOKEN)
        .digest();

    const calculatedHash = crypto
        .createHmac("sha256", secretKey)
        .update(dataCheckString)
        .digest("hex");

    const receivedBuffer = Buffer.from(receivedHash, "hex");
    const calculatedBuffer = Buffer.from(calculatedHash, "hex");

    if (
        receivedBuffer.length !== calculatedBuffer.length ||
        !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
        throw new Error("Invalid Telegram authentication");
    }

    const authDate = Number(params.get("auth_date"));

    if (!authDate) {
        throw new Error("Telegram auth_date is missing");
    }

    // Reject old Telegram authentication data.
    // 10 minutes is enough for Mini App login.
    const maxAge = 10 * 60;

    if (Math.floor(Date.now() / 1000) - authDate > maxAge) {
        throw new Error("Telegram authentication data has expired");
    }

    const userData = params.get("user");

    if (!userData) {
        throw new Error("Telegram user data is missing");
    }

    let telegramUser;

    try {
        telegramUser = JSON.parse(userData);
    } catch {
        throw new Error("Invalid Telegram user data");
    }

    if (!telegramUser.id) {
        throw new Error("Telegram user ID is missing");
    }

    return telegramUser;
};

const createTelegramLinkToken = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        // Generate a short-lived random token
        const token = crypto.randomBytes(32).toString("hex");

        user.telegramLinkToken = token;

        // Token valid for 10 minutes
        user.telegramLinkTokenExpire = new Date(
            Date.now() + 10 * 60 * 1000
        );

        await user.save();

        return res.status(200).json({
            success: true,
            token,
            expiresIn: 600,
            message: "Telegram link token created",
        });
    } catch (error) {
        console.error(
            "Create Telegram link token error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to create Telegram link token",
        });
    }
};

const completeTelegramLink = async (req, res) => {
    const botSecret = req.headers["x-telegram-bot-secret"];

    if (
        !process.env.TELEGRAM_BOT_LINK_SECRET ||
        botSecret !== process.env.TELEGRAM_BOT_LINK_SECRET
    ) {
        return res.status(401).json({
            success: false,
            message: "Unauthorized bot request",
        });
    }
    try {
        const { token, telegramUser } = req.body;

        if (!token) {
            return res.status(400).json({
                success: false,
                message: "Telegram link token is required",
            });
        }

        if (!telegramUser?.id) {
            return res.status(400).json({
                success: false,
                message: "Telegram user information is required",
            });
        }

        const user = await User.findOne({
            telegramLinkToken: token,
            telegramLinkTokenExpire: {
                $gt: new Date(),
            },
        });

        if (!user) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid or expired Telegram link token",
            });
        }

        const telegramId = String(telegramUser.id);

        // Make sure this Telegram account isn't
        // already linked to another CryptoMintX account.
        const existingUser = await User.findOne({
            telegramId,
        });

        if (
            existingUser &&
            String(existingUser._id) !== String(user._id)
        ) {
            return res.status(409).json({
                success: false,
                message:
                    "This Telegram account is already linked to another CryptoMintX account",
            });
        }

        user.telegramId = telegramId;

        // One-time token: invalidate immediately.
        user.telegramLinkToken = null;
        user.telegramLinkTokenExpire = null;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Telegram account linked successfully",
        });
    } catch (error) {
        console.error(
            "Complete Telegram link error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Unable to link Telegram account",
        });
    }
};

// =====================================================
// LINK TELEGRAM TO EXISTING CRYPTOMINTX ACCOUNT
// =====================================================

const linkTelegram = async (req, res) => {
    try {
        const { initData } = req.body;

        const telegramUser = getTelegramData(initData);

        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found",
            });
        }

        const telegramId = String(telegramUser.id);

        // Check whether this Telegram account
        // already belongs to another CryptoMintX account.
        const existingTelegramUser = await User.findOne({
            telegramId,
        });

        if (
            existingTelegramUser &&
            String(existingTelegramUser._id) !== String(user._id)
        ) {
            return res.status(409).json({
                success: false,
                message: "This Telegram account is already linked to another CryptoMintX account",
            });
        }

        user.telegramId = telegramId;

        await user.save();

        return res.status(200).json({
            success: true,
            message: "Telegram account linked successfully",
        });
    } catch (error) {
        console.error("Telegram link error:", error);

        return res.status(401).json({
            success: false,
            message: error.message || "Telegram authentication failed",
        });
    }
};


// =====================================================
// TELEGRAM MINI APP LOGIN
// =====================================================

const telegramLogin = async (req, res) => {
    try {
        const { initData } = req.body;

        const telegramUser = getTelegramData(initData);

        const telegramId = String(telegramUser.id);

        const user = await User.findOne({
            telegramId,
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message:
                    "This Telegram account is not linked to a CryptoMintX account",
            });
        }

        if (user.accountStatus === "SUSPENDED") {
            return res.status(403).json({
                success: false,
                message: "Your CryptoMintX account is suspended",
            });
        }

        const token = jwt.sign(
            {
                id: user._id,
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "1h",
            }
        );

        return res.status(200).json({
            success: true,
            token,
            user: {
                id: user._id,
                fullName: user.fullName,
                username: user.username,
                email: user.email,
                avatarUrl: user.avatarUrl,
                referralCode: user.referralCode,
                accountStatus: user.accountStatus,
            },
            message: "Telegram login successful",
        });
    } catch (error) {
        console.error("Telegram login error:", error);

        return res.status(401).json({
            success: false,
            message: error.message || "Telegram authentication failed",
        });
    }
};


export {
    createTelegramLinkToken,
    completeTelegramLink,
    linkTelegram,
    telegramLogin,
};