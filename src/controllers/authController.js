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
    email,
    password,
    referralCode,
  } = req.body;

  try {
    // -------------------------
    // Validate required fields
    // -------------------------
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
    }

    // -------------------------
    // Normalize email
    // -------------------------
    const normalizedEmail = email
      .trim()
      .toLowerCase();

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
      const normalizedReferralCode = referralCode
        .trim()
        .toUpperCase();

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
    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    // -------------------------
    // Create user
    // -------------------------
    const user = await User.create({
      email: normalizedEmail,
      password: hashedPassword,

      // User's own referral code
      referralCode: newReferralCode,

      // Person who referred this user
      referredBy: referrer
        ? referrer._id
        : null,

      // New users always start at Level 1
      teamLevel: 1,

      // Account requires deposit activation
      accountStatus: "PENDING",

      provider: "local",
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
    res.status(201).json({
      success: true,

      token,

      user: {
        id: user._id,
        email: user.email,
        referralCode: user.referralCode,
        accountStatus: user.accountStatus,
      },

      message: "User registered successfully",
    });

  } catch (error) {
    console.error("Register error:", error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const login = async (req, res) => {
  // Login logic here
  const { email, password } = req.body;


  try {
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: "Please provide email and password"
      });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "User not found, please register first" });

    }

    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({ message: "Invalid password" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.json({
      success: true,
      token,
      user: { id: user._id, email: user.email }
    });

  } catch (err) {
    res.status(500).json({
      success: false,
      message: err.message
    })
  }



}

const getMe = async (req, res) => {
  try {
    const user = await User.findById(
      req.user.id
    ).select("-password");

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
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

    const ticket = await clientId.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const email = payload.email?.trim().toLowerCase();
    const googleId = payload.sub;

    if (!email || !googleId) {
      return res.status(400).json({
        success: false,
        message: "Invalid Google account information",
      });
    }

    let user = await User.findOne({ email });


    // Generate a referral code when needed
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

    // Existing user
    if (user) {
      let needsSave = false;

      // Link Google account if this email already
      // belongs to a local account.
      if (!user.googleId) {
        user.googleId = googleId;
        needsSave = true;
      }

      // Repair older Google users that don't have
      // the newer account fields.
      if (!user.referralCode) {
        user.referralCode = await generateReferralCode();
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

    // New Google user
    if (!user) {
      const referralCode = await generateReferralCode();

      user = await User.create({
        email,
        googleId,
        provider: "google",
        referralCode,
        referredBy: null,
        teamLevel: 1,
        accountStatus: "PENDING",
        activatedAt: null,
      });
    }

    // Generate our application's JWT
    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
        referralCode: user.referralCode,
        accountStatus: user.accountStatus,
      },
      message: "Google login successful",
    });

  } catch (error) {
    console.error("Google login error:", error);

    res.status(401).json({
      success: false,
      message: "Google authentication failed",
    });
  }
};

const forgotPassword = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Generate random token
    const resetToken = crypto.randomBytes(32).toString("hex");

    // Save token and expiry
    user.resetPasswordToken = resetToken;
    user.resetPasswordExpire = Date.now() + 15 * 60 * 1000; // 15 minutes

    await user.save();

    // Reset URL
    const resetUrl = `http://localhost:5173/reset-password/${resetToken}`;

    // HTML Email
    const htmlTemplate = `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Reset Password</title>
</head>

<body style="margin:0;padding:40px;background:#f4f6fb;font-family:Arial,sans-serif;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center">

<table width="600" cellpadding="0" cellspacing="0"
style="
background:#ffffff;
border-radius:16px;
overflow:hidden;
box-shadow:0 8px 30px rgba(0,0,0,.08);
">

<tr>
<td
style="
background:#1D66FF;
padding:40px;
text-align:center;
">

<h1
style="
margin:0;
color:white;
font-size:34px;
">
CryptoMintX
</h1>

<p
style="
margin-top:10px;
color:white;
font-size:16px;
opacity:.9;
">
Secure Password Reset
</p>

</td>
</tr>

<tr>
<td style="padding:40px;">

<h2 style="margin-top:0;color:#111827;">
Reset your password
</h2>

<p style="font-size:16px;color:#4B5563;line-height:1.8;">
Hello,
</p>

<p style="font-size:16px;color:#4B5563;line-height:1.8;">
We received a request to reset your CryptoMintX account password.
Click the button below to continue.
</p>

<div
style="
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

<p style="font-size:15px;color:#6B7280;">
This link expires in
<strong>15 minutes</strong>.
</p>

<p style="font-size:15px;color:#6B7280;">
If the button doesn't work, copy this link into your browser:
</p>

<p style="word-break:break-all;">
<a
href="${resetUrl}"
style="color:#1D66FF;">
${resetUrl}
</a>
</p>

<hr style="margin:40px 0;border:none;border-top:1px solid #E5E7EB;">

<p style="font-size:14px;color:#6B7280;">
If you didn't request this password reset,
you can safely ignore this email.
</p>

<p style="font-size:13px;color:#9CA3AF;margin-top:30px;">
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

    // Send email
    await sendEmail(
      user.email,
      "Reset Your CryptoMintX Password",

      // Plain text version
      `We received a request to reset your CryptoMintX password.

Reset Password:
${resetUrl}

This link expires in 15 minutes.

If you didn't request this, ignore this email.`,

      // HTML version
      htmlTemplate
    );

    res.status(200).json({
      success: true,
      message: "Password reset email sent",
    });


  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;
    const { token } = req.params;

    // Find user with matching token
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpire: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "Invalid or expired reset token",
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update password
    user.password = hashedPassword;

    // Remove reset token
    user.resetPasswordToken = undefined;
    user.resetPasswordExpire = undefined;

    await user.save();

    res.status(200).json({
      success: true,
      message: "Password reset successfully",
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

export { register, login, googleLogin, getMe, forgotPassword, resetPassword };