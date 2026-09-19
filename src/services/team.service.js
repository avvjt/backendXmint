import User from "../models/user.model.js";
import {
  TEAM_LEVEL_RULES,
  TEAM_COMMISSION_RATES,
} from "../config/teamConfig.js";

/**
 * Get the user's Level A, B and C team members.
 *
 * A = directly referred users
 * B = users referred by A
 * C = users referred by B
 */
const getTeamMembers = async (
  userId,
  session = null
) => {
  const levelAQuery = User.find({
    referredBy: userId,
  }).select(
    "_id fullName username accountStatus teamLevel createdAt"
  );

  if (session) {
    levelAQuery.session(session);
  }

  const levelA = await levelAQuery;

  const levelAIds = levelA.map(
    (user) => user._id
  );

  const levelBQuery = levelAIds.length
    ? User.find({
        referredBy: { $in: levelAIds },
      }).select(
        "_id fullName username accountStatus teamLevel createdAt"
      )
    : null;

  const levelB = levelBQuery
    ? session
      ? await levelBQuery.session(session)
      : await levelBQuery
    : [];

  const levelBIds = levelB.map(
    (user) => user._id
  );

  const levelCQuery = levelBIds.length
    ? User.find({
        referredBy: { $in: levelBIds },
      }).select(
        "_id fullName username accountStatus teamLevel createdAt"
      )
    : null;

  const levelC = levelCQuery
    ? session
      ? await levelCQuery.session(session)
      : await levelCQuery
    : [];

  return {
    levelA,
    levelB,
    levelC,
  };
};

/**
 * Calculate the user's team level from their A/B/C counts.
 */
const calculateTeamLevel = ({
  levelA,
  levelB,
  levelC,
}) => {
  const countA = levelA.length;
  const countBC = levelB.length + levelC.length;

  let level = 1;

  for (let candidate = 2; candidate <= 6; candidate++) {
    const rule = TEAM_LEVEL_RULES[candidate - 1];

    if (
      countA >= rule.requiredA &&
      countBC >= rule.requiredBC
    ) {
      level = candidate;
    } else {
      break;
    }
  }

  return level;
};

/**
 * Build complete team overview for one user.
 */
const getTeamOverview = async (userId) => {
  const user = await User.findById(userId).select(
    "_id fullName username referralCode teamLevel"
  );

  if (!user) {
    throw new Error("User not found");
  }

  const {
    levelA,
    levelB,
    levelC,
  } = await getTeamMembers(userId);

  const calculatedLevel = calculateTeamLevel({
    levelA,
    levelB,
    levelC,
  });

  // Keep the user's stored level synchronized.
  if (user.teamLevel !== calculatedLevel) {
    user.teamLevel = calculatedLevel;
    await user.save();
  }

  const stats = {
    levelA: levelA.length,
    levelB: levelB.length,
    levelC: levelC.length,
    total:
      levelA.length +
      levelB.length +
      levelC.length,
  };

  const currentRule =
    TEAM_LEVEL_RULES[calculatedLevel];

  const nextLevel = currentRule?.nextLevel;

  const progress = nextLevel
    ? {
        nextLevel,
        requiredA:
          TEAM_LEVEL_RULES[calculatedLevel]
            .requiredA,
        requiredBC:
          TEAM_LEVEL_RULES[calculatedLevel]
            .requiredBC,
        requiredTotal:
          TEAM_LEVEL_RULES[calculatedLevel]
            .requiredTotal,
      }
    : {
        nextLevel: null,
        requiredA: null,
        requiredBC: null,
        requiredTotal: null,
      };

  const commission =
    TEAM_COMMISSION_RATES[calculatedLevel];

  return {
    level: calculatedLevel,

    referralCode: user.referralCode,

    stats,

    progress,

    commission,

    income: {
      today: 0,
      levelA: 0,
      levelB: 0,
      levelC: 0,
    },

    referralBonus: {
      rate: 5,
      earned: 0,
    },
  };
};

const syncTeamLevel = async (
  userId,
  session = null
) => {
  const {
  levelA,
  levelB,
  levelC,
} = await getTeamMembers(
  userId,
  session
);

  const calculatedLevel = calculateTeamLevel({
    levelA,
    levelB,
    levelC,
  });

  const userQuery = User.findById(userId);

  if (session) {
    userQuery.session(session);
  }

  const user = await userQuery;

  if (!user) {
    throw new Error("User not found");
  }

  if (user.teamLevel !== calculatedLevel) {
    user.teamLevel = calculatedLevel;

    await user.save(
      session ? { session } : {}
    );
  }

  return calculatedLevel;
};

export {
  getTeamMembers,
  calculateTeamLevel,
  getTeamOverview,
  syncTeamLevel,
};