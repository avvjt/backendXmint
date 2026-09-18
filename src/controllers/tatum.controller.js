const testTatumConnection = async (req, res) => {
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
      console.error("Tatum error:", data);

      return res.status(response.status).json({
        success: false,
        message: "Tatum API request failed",
        error: data,
      });
    }

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

    const xpub = process.env.TATUM_BSC_XPUB;
    const apiKey = process.env.TATUM_API_KEY;

    if (!xpub || index === undefined) {
      return res.status(400).json({
        success: false,
        message: "Wallet configuration is missing",
      });
    }

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Tatum API key is not configured",
      });
    }

    const numericIndex = Number(index);

    if (!Number.isInteger(numericIndex) || numericIndex < 0) {
      return res.status(400).json({
        success: false,
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
          "x-api-key": apiKey,
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data.address) {
      console.error("Tatum address error:", data);

      return res.status(response.status || 500).json({
        success: false,
        message: "Failed to generate BSC address",
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


export {
  testTatumConnection,
  generateBscAddress,
};