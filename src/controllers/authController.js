import User from '../models/user.model.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";


const clientId = new OAuth2Client(process.env.CLIENT_ID);

const register = async (req, res) => {
  console.log(req.body);

  const {
    fullName,
    username,
    email,
    password,
    referralCode,
  } = req.body;

  try {
    // -------------------------
    // Validate required fields
    // -------------------------
    if (!fullName || !email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Full name, email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters",
      });
    }

    // -------------------------
    // Normalize values
    // -------------------------
    const normalizedEmail = email
      .trim()
      .toLowerCase();

    const normalizedFullName = fullName.trim();

    const normalizedUsername = username
      ? username.trim().toLowerCase()
      : "";

    // -------------------------
    // Check existing user
    // -------------------------
    const existingUser = await User.findOne({
      email: normalizedEmail,
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "User already exists",
      });
    }

    // -------------------------
    // Find referring user
    // -------------------------
    let referrer = null;

    if (referralCode && referralCode.trim()) {
      const normalizedReferralCode =
        referralCode.trim().toUpperCase();

      referrer = await User.findOne({
        referralCode: normalizedReferralCode,
      });

      if (!referrer) {
        return res.status(400).json({
          success: false,
          message: "Invalid referral code",
        });
      }
    }

    // -------------------------
    // Generate unique referral code
    // -------------------------
    let newReferralCode;
    let codeExists = true;

    while (codeExists) {
      newReferralCode =
        "CMX" +
        crypto
          .randomBytes(4)
          .toString("hex")
          .toUpperCase();

      codeExists = await User.exists({
        referralCode: newReferralCode,
      });
    }

    // -------------------------
    // Hash password
    // -------------------------
    const hashedPassword =
      await bcrypt.hash(password, 10);

    // -------------------------
    // Create user
    // -------------------------
    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,

      fullName: normalizedFullName,
      username: normalizedUsername,

      // Email/password account
      provider: "local",

      // No Google photo for local signup
      avatarUrl: "",

      // Referral
      referralCode: newReferralCode,

      referredBy: referrer
        ? referrer._id
        : null,

      teamLevel: 1,

      // Account requires activation
      accountStatus: "PENDING",

      activatedAt: null,
    });

    // -------------------------
    // Create JWT
    // -------------------------
    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // -------------------------
    // Response
    // -------------------------
    return res.status(201).json({
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

      message: "User registered successfully",
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const login = async (req, res) => {
  const { email, password } = req.body;

  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide email and password",
      });
    }

    const normalizedEmail =
      email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "User not found, please register first",
      });
    }

    // Google-only account
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account uses Google login. Please continue with Google.",
      });
    }

    const isPasswordValid =
      await bcrypt.compare(
        password,
        user.password
      );

    if (!isPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    return res.json({
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

      message: "Login successful",
    });
  } catch (err) {
    console.error("Login error:", err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

const getMe = async (req, res) => {
  try {
    const user = await User.findById(
      req.user.id
    ).select("-password");

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error(
      "Get current user error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to fetch user",
    });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Google token is required",
      });
    }

    // -------------------------
    // Verify Google token
    // -------------------------
    const ticket = await clientId.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const email =
      payload.email?.trim().toLowerCase();

    const googleId = payload.sub;

    const googleName =
      payload.name?.trim() ||
      "CryptoMintX User";

    const googleAvatar =
      payload.picture || "";

    if (!email || !googleId) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid Google account information",
      });
    }

    // -------------------------
    // Find existing user
    // -------------------------
    let user = await User.findOne({
      email,
    });

    // -------------------------
    // Generate referral code
    // -------------------------
    const generateReferralCode = async () => {
      let referralCode;
      let codeExists = true;

      while (codeExists) {
        referralCode =
          "CMX" +
          crypto
            .randomBytes(4)
            .toString("hex")
            .toUpperCase();

        codeExists = await User.exists({
          referralCode,
        });
      }

      return referralCode;
    };

    // -------------------------
    // Existing user
    // -------------------------
    if (user) {
      let needsSave = false;

      // Link Google account
      if (!user.googleId) {
        user.googleId = googleId;
        needsSave = true;
      }

      // Add Google name if missing
      if (
        !user.fullName ||
        user.fullName === "CryptoMintX User"
      ) {
        user.fullName = googleName;
        needsSave = true;
      }

      // Add Google profile picture
      if (
        googleAvatar &&
        user.avatarUrl !== googleAvatar
      ) {
        user.avatarUrl = googleAvatar;
        needsSave = true;
      }

      // Repair older users
      if (!user.referralCode) {
        user.referralCode =
          await generateReferralCode();

        needsSave = true;
      }

      if (!user.teamLevel) {
        user.teamLevel = 1;
        needsSave = true;
      }

      if (!user.accountStatus) {
        user.accountStatus = "PENDING";
        needsSave = true;
      }

      if (needsSave) {
        await user.save();
      }
    }

    // -------------------------
    // New Google user
    // -------------------------
    if (!user) {
      const referralCode =
        await generateReferralCode();

      user = await User.create({
        email,
        googleId,

        provider: "google",

        fullName: googleName,
        username: "",

        phone: "",

        avatarUrl: googleAvatar,

        referralCode,

        referredBy: null,

        teamLevel: 1,

        accountStatus: "PENDING",

        activatedAt: null,
      });
    }

    // -------------------------
    // Create JWT
    // -------------------------
    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    // -------------------------
    // Response
    // -------------------------
    return res.status(200).json({
      success: true,

      token: jwtToken,

      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
        referralCode: user.referralCode,
        accountStatus: user.accountStatus,
      },

      message: "Google login successful",
    });
  } catch (error) {
    console.error(
      "Google login error:",
      error
    );

    return res.status(401).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    if (!email) {
      return res.status(400).json({
        success: false,
        message: "Email is required",
      });
    }

    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    // Don't reveal whether an account exists
    if (!user) {
      return res.status(200).json({
        success: true,
        message:
          "If an account exists with this email, a password reset link has been sent.",
      });
    }

    // Generate secure random token
    const resetToken = crypto
      .randomBytes(32)
      .toString("hex");

    // Token expires in 15 minutes
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = new Date(
      Date.now() + 15 * 60 * 1000
    );

    await user.save();

    // IMPORTANT:
    // Frontend = 5173
    // Backend = 3000
    const resetUrl =
      `http://localhost:5173/reset-password/${resetToken}`;

    const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Reset Password</title>
</head>

<body style="
margin:0;
padding:40px;
background:#f4f6fb;
font-family:Arial,sans-serif;
">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="
background:#ffffff;
border-radius:16px;
overflow:hidden;
">

<tr>
<td style="
background:#1D66FF;
padding:40px;
text-align:center;
">

<h1 style="
margin:0;
color:white;
font-size:34px;
">
CryptoMintX
</h1>

<p style="
margin-top:10px;
color:white;
font-size:16px;
">
Secure Password Reset
</p>

</td>
</tr>

<tr>
<td style="padding:40px;">

<h2 style="
margin-top:0;
color:#111827;
">
Reset your password
</h2>

<p style="
font-size:16px;
color:#4B5563;
line-height:1.8;
">
We received a request to reset your CryptoMintX
account password.
</p>

<p style="
font-size:16px;
color:#4B5563;
line-height:1.8;
">
Click the button below to create a new password.
</p>

<div style="
margin:40px 0;
text-align:center;
">

<a
href="${resetUrl}"
style="
display:inline-block;
background:#1D66FF;
padding:16px 36px;
border-radius:999px;
text-decoration:none;
color:white;
font-size:16px;
font-weight:bold;
">
Reset Password
</a>

</div>

<p style="
font-size:15px;
color:#6B7280;
">
This link expires in
<strong>15 minutes</strong>.
</p>

<p style="
font-size:15px;
color:#6B7280;
">
If you did not request this password reset,
you can safely ignore this email.
</p>

<p style="
word-break:break-all;
font-size:13px;
">

<a
href="${resetUrl}"
style="color:#1D66FF;">
${resetUrl}
</a>

</p>

<hr style="
margin:40px 0;
border:none;
border-top:1px solid #E5E7EB;
">

<p style="
font-size:13px;
color:#9CA3AF;
">
CryptoMintX Security Team
</p>

</td>
</tr>

</table>

</td>
</tr>
</table>

</body>
</html>
`;

    await sendEmail(
      user.email,
      "Reset Your CryptoMintX Password",

      // Plain text
      `We received a request to reset your CryptoMintX password.

Reset Password:
${resetUrl}

This link expires in 15 minutes.

If you did not request this, you can safely ignore this email.`,

      // HTML
      htmlTemplate
    );

    return res.status(200).json({
      success: true,
      message:
        "If an account exists with this email, a password reset link has been sent.",
    });

  } catch (error) {
    console.error(
      "Forgot password error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Unable to process password reset request",
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        success: false,
        message: "Reset token is required",
      });
    }

    if (!password) {
      return res.status(400).json({
        success: false,
        message: "New password is required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message:
          "Password must be at least 8 characters",
      });
    }

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: {
        $gt: new Date(),
      },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message:
          "Invalid or expired reset token",
      });
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    user.password = hashedPassword;

    // Invalidate token after successful reset
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });

  } catch (error) {
    console.error(
      "Reset password error:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Unable to reset password",
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
    }

    // Get the currently logged-in user
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Google-only accounts don't have a password
    if (!user.password) {
      return res.status(400).json({
        success: false,
        message:
          "This account does not have a password. Please use Google sign-in.",
      });
    }

    // Check current password
    const isCurrentPasswordValid = await bcrypt.compare(
      currentPassword,
      user.password
    );

    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        success: false,
        message: "Current password is incorrect",
      });
    }

    // Prevent using the same password
    const isSamePassword = await bcrypt.compare(
      newPassword,
      user.password
    );

    if (isSamePassword) {
      return res.status(400).json({
        success: false,
        message:
          "New password must be different from your current password",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    user.password = hashedPassword;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Change password error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to change password",
    });
  }
};

export { register, login, googleLogin, getMe, forgotPassword, resetPassword, changePassword };