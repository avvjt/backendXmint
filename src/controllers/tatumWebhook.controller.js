import crypto from "crypto";

const tatumWebhook = async (req, res) => {
  try {
    const receivedHash = req.headers["x-payload-hash"];
    const secret = process.env.TATUM_WEBHOOK_SECRET;

    if (!secret) {
      console.error("TATUM_WEBHOOK_SECRET is not configured.");
      return res.status(500).json({
        success: false,
        message: "Webhook security is not configured",
      });
    }

    if (!receivedHash) {
      return res.status(401).json({
        success: false,
        message: "Missing webhook signature",
      });
    }

    const calculatedHash = crypto
      .createHmac("sha512", secret)
      .update(JSON.stringify(req.body))
      .digest("base64");

    const receivedBuffer = Buffer.from(receivedHash);
    const calculatedBuffer = Buffer.from(calculatedHash);

    if (
      receivedBuffer.length !== calculatedBuffer.length ||
      !crypto.timingSafeEqual(receivedBuffer, calculatedBuffer)
    ) {
      console.warn("Invalid Tatum webhook signature.");
      return res.status(401).json({
        success: false,
        message: "Invalid webhook signature",
      });
    }

    console.log("========== VERIFIED TATUM WEBHOOK ==========");
    console.log(JSON.stringify(req.body, null, 2));
    console.log("=============================================");

    return res.status(200).json({
      success: true,
      message: "Tatum webhook received",
    });
  } catch (error) {
    console.error("Tatum webhook error:", error);

    return res.status(500).json({
      success: false,
      message: "Webhook processing failed",
    });
  }
};

export { tatumWebhook };