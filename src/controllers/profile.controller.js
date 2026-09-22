import User from "../models/user.model.js";
import cloudinary from "../config/cloudinary.js";
import fs from "fs/promises";

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
      // Remove temporary uploaded file
      try {
        await fs.unlink(req.file.path);
      } catch {}

      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Upload temporary file to Cloudinary
    const uploadResult = await cloudinary.uploader.upload(
      req.file.path,
      {
        folder: "cryptomintx/profile",
        resource_type: "image",
      }
    );

    // Delete old Cloudinary image
    if (user.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(
          user.avatarPublicId
        );
      } catch (error) {
        console.error(
          "Unable to delete old Cloudinary avatar:",
          error
        );
      }
    }

    // Save new Cloudinary information
    user.avatarUrl = uploadResult.secure_url;
    user.avatarPublicId = uploadResult.public_id;

    await user.save();

    // Delete temporary local file
    try {
      await fs.unlink(req.file.path);
    } catch (error) {
      console.error(
        "Unable to remove temporary avatar:",
        error
      );
    }

    return res.status(200).json({
      success: true,
      message: "Profile picture updated successfully",
      avatarUrl: user.avatarUrl,
    });
  } catch (error) {
    console.error("Upload avatar error:", error);

    // Clean up temporary file if it exists
    if (req.file?.path) {
      try {
        await fs.unlink(req.file.path);
      } catch {}
    }

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

    if (user.avatarPublicId) {
      try {
        await cloudinary.uploader.destroy(
          user.avatarPublicId
        );
      } catch (error) {
        console.error(
          "Unable to delete Cloudinary avatar:",
          error
        );
      }
    }

    user.avatarUrl = "";
    user.avatarPublicId = "";

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