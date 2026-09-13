import User from "../models/user.model.js";
import fs from "fs/promises";
import path from "path";

const updateProfile = async (req, res) => {
  try {
    const { fullName, username } = req.body;

    if (!fullName || !username) {
      return res.status(400).json({
        success: false,
        message: "Full name and username are required",
      });
    }

    const normalizedFullName = fullName.trim();
    const normalizedUsername = username.trim().toLowerCase();

    if (!normalizedFullName || !normalizedUsername) {
      return res.status(400).json({
        success: false,
        message: "Full name and username are required",
      });
    }

    // Check whether another user already has this username
    const existingUser = await User.findOne({
      username: normalizedUsername,
      _id: { $ne: req.user.id },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Username is already taken",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    user.fullName = normalizedFullName;
    user.username = normalizedUsername;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      user: {
        id: user._id,
        fullName: user.fullName,
        username: user.username,
        email: user.email,
        avatarUrl: user.avatarUrl,
      },
    });
  } catch (error) {
    console.error("Update profile error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to update profile",
    });
  }
};

const uploadAvatar = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Profile picture is required",
      });
    }

    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const avatarUrl =
      `/uploads/profile/${req.file.filename}`;

    user.avatarUrl = avatarUrl;

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      avatarUrl: user.avatarUrl,
    });
  } catch (error) {
    console.error("Upload avatar error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to upload profile picture",
    });
  }
};

const deleteAvatar = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Delete the existing physical image
    if (user.avatarUrl) {
      const relativePath = user.avatarUrl.replace(/^\/+/, "");

      const filePath = path.join(
        process.cwd(),
        relativePath
      );

      try {
        await fs.unlink(filePath);
      } catch (error) {
        // File may already be missing
        if (error.code !== "ENOENT") {
          console.error(
            "Unable to delete old avatar:",
            error
          );
        }
      }
    }

    // Remove avatar URL from MongoDB
    user.avatarUrl = "";

    await user.save();

    return res.status(200).json({
      success: true,
      message: "Profile picture removed successfully",
      avatarUrl: "",
    });
  } catch (error) {
    console.error("Delete avatar error:", error);

    return res.status(500).json({
      success: false,
      message: "Unable to remove profile picture",
    });
  }
};

export {
  updateProfile,
  uploadAvatar,
  deleteAvatar,
};