import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  // Don't wait forever if Gmail connection fails
  connectionTimeout: 10000,
  greetingTimeout: 10000,
  socketTimeout: 10000,
});

const sendEmail = async (to, subject, text, html) => {
  try {
    console.log("EMAIL: Connecting to Gmail...");
    console.log("EMAIL USER:", process.env.EMAIL_USER);

    const info = await transporter.sendMail({
      from: `"CryptoMintX Security" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      html,
    });

    console.log("EMAIL: Sent successfully");
    console.log("EMAIL MESSAGE ID:", info.messageId);

    return info;
  } catch (error) {
    console.error("EMAIL SEND ERROR:", error);

    throw error;
  }
};

export default sendEmail;