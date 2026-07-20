import User from '../models/user.model.js';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OAuth2Client } from 'google-auth-library';
import crypto from "crypto";
import sendEmail from "../utils/sendEmail.js";


const clientId = new OAuth2Client(process.env.CLIENT_ID);

const register = async (req, res) => {
  console.log(req.body);
  // Registration logic here
  const { email, password, referalCode } = req.body;

  try {

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ email, password: hashedPassword, referalCode });

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });

    res.status(201).json({
      success: true,
      token,
      user: { id: user._id, email: user.email },
      message: { "success": "User registered successfully" }

    }

    );
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}

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

    const ticket = await clientId.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    const email = payload.email;
    const googleId = payload.sub;

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        email,
        googleId,
        provider: "google",
      });
    }

    const jwtToken = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.status(200).json({
      success: true,
      token: jwtToken,
      user: {
        id: user._id,
        email: user.email,
      },
    });
  } catch (error) {
    console.error(error); // Keep this while debugging

    res.status(500).json({
      success: false,
      message: error.message,
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