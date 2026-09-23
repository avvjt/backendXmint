import User from "../models/user.model.js";
import TeamIncome from "../models/teamIncome.model.js";
import ReferralBonus from "../models/referralBonus.model.js";

import {
  TEAM_LEVEL_RULES,
  TEAM_COMMISSION_RATES,
  REFERRAL_BONUS_RATE,
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
  const countBC =
    levelB.length + levelC.length;

  let level = 1;

  for (let candidate = 2; candidate <= 6; candidate++) {
    const rule =
      TEAM_LEVEL_RULES[candidate - 1];

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
 * Get today's date range.
 *
 * Uses the server's local date boundaries.
 */
const getTodayRange = () => {
  const start = new Date();

  start.setHours(0, 0, 0, 0);

  const end = new Date(start);

  end.setDate(end.getDate() + 1);

  return {
    start,
    end,
  };
};

/**
 * Get today's team commission income.
 */
const getTodayTeamIncome = async (
  userId
) => {
  const { start, end } = getTodayRange();

  const income = await TeamIncome.aggregate([
    {
      $match: {
        user: userId,
        type: "TEAM_COMMISSION",
        status: "COMPLETED",
        createdAt: {
          $gte: start,
          $lt: end,
        },
      },
    },
    {
      $group: {
        _id: "$teamLevel",
        amount: {
          $sum: "$amount",
        },
      },
    },
  ]);

  const result = {
    today: 0,
    levelA: 0,
    levelB: 0,
    levelC: 0,
  };

  for (const item of income) {
    const amount = Number(item.amount || 0);

    if (item._id === "A") {
      result.levelA = amount;
    }

    if (item._id === "B") {
      result.levelB = amount;
    }

    if (item._id === "C") {
      result.levelC = amount;
    }
  }

  result.today =
    result.levelA +
    result.levelB +
    result.levelC;

  return result;
};

/**
 * Get total referral bonus earned by the user.
 *
 * Referral bonus is one-time per referred user,
 * so this returns the user's accumulated total.
 */
const getReferralBonusIncome = async (
  userId
) => {
  const result =
    await ReferralBonus.aggregate([
      {
        $match: {
          referrer: userId,
          status: "COMPLETED",
        },
      },
      {
        $group: {
          _id: null,
          total: {
            $sum: "$bonusAmount",
          },
        },
      },
    ]);

  return Number(
    result[0]?.total || 0
  );
};

/**
 * Build complete team overview for one user.
 */
const getTeamOverview = async (
  userId
) => {
  const user = await User.findById(
    userId
  ).select(
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

  const calculatedLevel =
    calculateTeamLevel({
      levelA,
      levelB,
      levelC,
    });

  // Keep stored team level synchronized.
  if (
    user.teamLevel !== calculatedLevel
  ) {
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

  const nextLevel =
    currentRule?.nextLevel;

  const progress = nextLevel
    ? {
        nextLevel,

        requiredA:
          TEAM_LEVEL_RULES[
            calculatedLevel
          ].requiredA,

        requiredBC:
          TEAM_LEVEL_RULES[
            calculatedLevel
          ].requiredBC,

        requiredTotal:
          TEAM_LEVEL_RULES[
            calculatedLevel
          ].requiredTotal,
      }
    : {
        nextLevel: null,
        requiredA: null,
        requiredBC: null,
        requiredTotal: null,
      };

  const commission =
    TEAM_COMMISSION_RATES[
      calculatedLevel
    ];

  // Get real income data.
  const income =
    await getTodayTeamIncome(userId);

  // Get accumulated one-time referral bonuses.
  const referralBonusEarned =
    await getReferralBonusIncome(
      userId
    );

  return {
    level: calculatedLevel,

    referralCode:
      user.referralCode,

    stats,

    progress,

    commission,

    income,

    referralBonus: {
      rate: REFERRAL_BONUS_RATE,
      earned: referralBonusEarned,
    },
  };
};

/**
 * Synchronize a user's team level.
 */
const syncTeamLevel = async (
  userId,
  session = null
) => {
  console.log("TEAM STEP 1: Getting team members...");

  const {
    levelA,
    levelB,
    levelC,
  } = await getTeamMembers(
    userId,
    session
  );

  console.log("TEAM STEP 1 DONE:", {
    levelA: levelA.length,
    levelB: levelB.length,
    levelC: levelC.length,
  });

  const calculatedLevel =
    calculateTeamLevel({
      levelA,
      levelB,
      levelC,
    });

  console.log(
    "TEAM STEP 2: Calculated level:",
    calculatedLevel
  );

  const userQuery =
    User.findById(userId);

  if (session) {
    userQuery.session(session);
  }

  console.log("TEAM STEP 3: Loading user...");

  const user = await userQuery;

  console.log("TEAM STEP 3 DONE: User loaded");

  if (!user) {
    throw new Error("User not found");
  }

  if (
    user.teamLevel !== calculatedLevel
  ) {
    console.log(
      "TEAM STEP 4: Updating team level..."
    );

    user.teamLevel =
      calculatedLevel;

    await user.save(
      session
        ? { session }
        : {}
    );

    console.log(
      "TEAM STEP 4 DONE: Team level saved"
    );
  } else {
    console.log(
      "TEAM STEP 4 SKIPPED: Team level already correct"
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