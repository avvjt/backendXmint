
import User from "../models/user.model.js";

const adminOnly = async (req, res, next) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required.",
      });
    }

    // Read the role from the database, not from client input or JWT claims.
    const user = await User.findById(userId).select("role");

    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({
        success: false,
        message: "Admin access required.",
      });
    }

    next();
  } catch (error) {
    console.error("Admin authorization failed:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to verify admin access.",
    });
  }
};

export default adminOnly;