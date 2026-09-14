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
    const { xpub, index } = req.body;

    if (!xpub || index === undefined) {
      return res.status(400).json({
        message: "xpub and index are required",
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

export {
  testTatumConnection,
  generateBscAddress,
};