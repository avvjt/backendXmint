import {
  getTeamOverview,
  getTeamMembers,
} from "../services/team.service.js";

const getTeam = async (req, res) => {
  try {
    const team = await getTeamOverview(req.user.id);

    return res.status(200).json(team);
  } catch (error) {
    console.error("Get team error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Unable to load team information.",
    });
  }
};

const getMembers = async (req, res) => {
  try {
    const { level } = req.query;

    if (!["A", "B", "C"].includes(level)) {
      return res.status(400).json({
        success: false,
        message: "Invalid team level. Use A, B or C.",
      });
    }

    const {
      levelA,
      levelB,
      levelC,
    } = await getTeamMembers(req.user.id);

    const membersMap = {
      A: levelA,
      B: levelB,
      C: levelC,
    };

    const members = membersMap[level].map((member) => ({
      id: member._id,
      name: member.fullName,
      username: member.username,
      avatarUrl: member.avatarUrl || "",
      level,
      status: member.accountStatus,
      todayEarning: 0,
    }));

    return res.status(200).json({
      success: true,
      members,
    });
  } catch (error) {
    console.error("Get team members error:", error);

    return res.status(500).json({
      success: false,
      message:
        error.message || "Unable to load team members.",
    });
  }
};

export {
  getTeam,
  getMembers,
};