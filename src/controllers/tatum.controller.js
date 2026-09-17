import { deriveSweepPrivateKey } from "../services/sweep.service.js";


const testTatumConnection = async (req, res) => {
  try {
    const response = await fetch("https://api.tatum.io/v3/bsc/wallet", {
      method: "GET",
      headers: {
        "x-api-key": process.env.TATUM_API_KEY,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Tatum error:", data);

      return res.status(response.status).json({
        success: false,
        message: "Tatum API request failed",
        error: data,
      });
    }

    // IMPORTANT:
    // Never send the mnemonic to the frontend.
    console.log("Tatum BSC wallet response received.");

    return res.status(200).json({
      success: true,
      message: "Tatum connection successful",
      xpub: data.xpub,
    });
  } catch (error) {
    console.error("Tatum connection error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to connect to Tatum",
    });
  }
};

const generateBscAddress = async (req, res) => {
  try {
    const { index } = req.body;

    // XPUB must come from the server environment.
    // Never accept it from the frontend.
    const xpub = process.env.TATUM_BSC_XPUB;

    if (!xpub || index === undefined) {
      return res.status(400).json({
        message: "Wallet configuration is missing",
      });
    }

    const numericIndex = Number(index);

    if (!Number.isInteger(numericIndex) || numericIndex < 0) {
      return res.status(400).json({
        message: "Index must be a non-negative integer",
      });
    }

    const response = await fetch(
      `https://api.tatum.io/v3/bsc/address/${encodeURIComponent(
        xpub
      )}/${numericIndex}`,
      {
        method: "GET",
        headers: {
          "x-api-key": process.env.TATUM_API_KEY,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Tatum address error:", data);

      return res.status(response.status).json({
        success: false,
        message: "Failed to generate BSC address",
        error: data,
      });
    }

    return res.status(200).json({
      success: true,
      address: data.address,
      index: numericIndex,
    });
  } catch (error) {
    console.error("Generate BSC address error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to generate BSC address",
    });
  }
};

const generateBscWallet = async (req, res) => {
  try {
    const response = await fetch(
      "https://api.tatum.io/v3/bsc/wallet",
      {
        method: "GET",
        headers: {
          "x-api-key": process.env.TATUM_API_KEY,
        },
      }
    );

    const data = await response.json();

    if (!response.ok) {
      console.error("Tatum wallet generation failed:", data);

      return res.status(response.status).json({
        success: false,
        message: "Failed to generate BSC wallet",
        error: data,
      });
    }

    console.log("========== NEW BSC WALLET ==========");
    console.log("Wallet generated successfully.");
    console.log("====================================");

    return res.status(200).json({
      success: true,
      wallet: data,
    });
  } catch (error) {
    console.error("BSC wallet generation error:", error);

    return res.status(500).json({
      success: false,
      message: "Server error while generating BSC wallet",
    });
  }
};

const testSweepAddress = async (req, res) => {
  try {
    const index = Number(req.query.index ?? 0);

    if (!Number.isInteger(index) || index < 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid index",
      });
    }

    // Derive the private key internally to verify
    // that the mnemonic is configured correctly.
    await deriveSweepPrivateKey(index);

    const xpub = process.env.TATUM_BSC_XPUB;
    const apiKey = process.env.TATUM_API_KEY;

    const response = await fetch(
      `https://api.tatum.io/v3/bsc/address/${encodeURIComponent(
        xpub
      )}/${index}`,
      {
        method: "GET",
        headers: {
          "x-api-key": apiKey,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.address) {
      throw new Error("Failed to get BSC address");
    }

    return res.status(200).json({
      success: true,
      index,
      address: data.address,
    });
  } catch (error) {
    console.error("Sweep address test failed:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to derive sweep address",
    });
  }
};

export {
  testTatumConnection,
  generateBscAddress,
  generateBscWallet,
  testSweepAddress,
};
