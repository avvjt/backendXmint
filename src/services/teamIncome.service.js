import User from "../models/user.model.js";
import Wallet from "../models/wallet.model.js";
import TeamIncome from "../models/teamIncome.model.js";
import ReferralBonus from "../models/referralBonus.model.js";

import {
  TEAM_COMMISSION_RATES,
  REFERRAL_BONUS_RATE,
  MAX_TEAM_DEPTH,
} from "../config/teamConfig.js";

/**
 * Get A/B/C uplines for a user.
 *
 * Example:
 *
 * C → B → A → User
 *
 * returns:
 * A = direct referrer
 * B = referrer's referrer
 * C = next referrer
 */
const getUpline = async (userId) => {
  const levels = {
    A: null,
    B: null,
    C: null,
  };

  let currentUserId = userId;

  for (let depth = 1; depth <= MAX_TEAM_DEPTH; depth++) {
    const user = await User.findById(currentUserId).select(
      "_id referredBy teamLevel"
    );

    if (!user?.referredBy) {
      break;
    }

    const referrer = await User.findById(
      user.referredBy
    ).select("_id referredBy teamLevel");

    if (!referrer) {
      break;
    }

    if (depth === 1) {
      levels.A = referrer;
    }

    if (depth === 2) {
      levels.B = referrer;
    }

    if (depth === 3) {
      levels.C = referrer;
    }

    currentUserId = referrer._id;
  }

  return levels;
};

/**
 * Credit money to a user's available wallet balance.
 */
const creditWallet = async (
  userId,
  amount,
  session = null
) => {
  const query = Wallet.findOne({
    user: userId,
    asset: "USDT",
    network: "BEP20",
  });

  if (session) {
    query.session(session);
  }

  const wallet = await query;

  if (!wallet) {
    throw new Error(
      `Wallet not found for user ${userId}`
    );
  }

  wallet.availableBalance += amount;

  await wallet.save(
    session ? { session } : {}
  );

  return wallet;
};

/**
 * Process the one-time 5% referral bonus.
 *
 * Called after a referred user's qualifying deposit.
 */
const processReferralBonus = async ({
  referredUserId,
  depositId,
  depositAmount,
  session = null,
}) => {
  if (
    !referredUserId ||
    !depositId ||
    !Number.isFinite(Number(depositAmount)) ||
    Number(depositAmount) <= 0
  ) {
    return {
      success: false,
      skipped: true,
      message: "Invalid referral bonus data",
    };
  }

  const referredUser = await User.findById(
    referredUserId
  ).select("_id referredBy");

  if (!referredUser) {
    return {
      success: false,
      skipped: true,
      message: "Referred user not found",
    };
  }

  // No referrer = no referral bonus.
  if (!referredUser.referredBy) {
    return {
      success: true,
      skipped: true,
      message: "User has no referrer",
    };
  }

  const amount = Number(depositAmount);

  const bonusAmount =
    Math.round(
      amount *
        (REFERRAL_BONUS_RATE / 100) *
        100
    ) / 100;

  if (bonusAmount <= 0) {
    return {
      success: true,
      skipped: true,
      message: "Referral bonus amount is zero",
    };
  }

  const referrer = await User.findById(
    referredUser.referredBy
  ).select("_id");

  if (!referrer) {
    return {
      success: false,
      skipped: true,
      message: "Referrer not found",
    };
  }

  /*
   * Check whether this user has already received
   * the one-time referral bonus.
   *
   * IMPORTANT:
   * We check BEFORE attempting to create a duplicate
   * record. A duplicate-key error inside a MongoDB
   * transaction can abort the entire transaction.
   */
  const existingBonusQuery = ReferralBonus.findOne({
    referredUser: referredUser._id,
  });

  if (session) {
    existingBonusQuery.session(session);
  }

  const existingBonus = await existingBonusQuery;

  if (existingBonus) {
    return {
      success: true,
      skipped: true,
      message: "Referral bonus already processed",
    };
  }

  /*
   * Create the one-time bonus record.
   *
   * The unique index on referredUser remains as
   * an additional protection against duplicate records.
   */
  const [bonus] = await ReferralBonus.create(
    [
      {
        referrer: referrer._id,
        referredUser: referredUser._id,
        deposit: depositId,
        depositAmount: amount,
        rate: REFERRAL_BONUS_RATE,
        bonusAmount,
        status: "COMPLETED",
        creditedAt: new Date(),
      },
    ],
    session ? { session } : {}
  );

  // Only credit the wallet AFTER the bonus record
  // has been successfully created.
  const wallet = await creditWallet(
    referrer._id,
    bonusAmount,
    session
  );

  const [teamIncome] = await TeamIncome.create(
    [
      {
        user: referrer._id,
        sourceUser: referredUser._id,
        teamLevel: "A",
        sourceAmount: amount,
        rate: REFERRAL_BONUS_RATE,
        amount: bonusAmount,
        type: "REFERRAL_BONUS",
        referenceId: bonus._id,
        status: "COMPLETED",
        description:
          "One-time referral bonus from first deposit",
      },
    ],
    session ? { session } : {}
  );

  return {
    success: true,
    skipped: false,
    bonusId: bonus._id,
    walletId: wallet._id,
    incomeId: teamIncome._id,
    amount: bonusAmount,
  };
};

/**
 * Process A/B/C team commission from a user's earning.
 */
const processTeamCommission = async ({
  sourceUserId,
  earningAmount,
  referenceId = null,
  session = null,
}) => {
  if (
    !sourceUserId ||
    !Number.isFinite(Number(earningAmount)) ||
    Number(earningAmount) <= 0
  ) {
    return {
      success: false,
      message: "Invalid team commission data",
    };
  }

  const amount = Number(earningAmount);

  const upline = await getUpline(sourceUserId);

  const recipients = [
    {
      level: "A",
      user: upline.A,
    },
    {
      level: "B",
      user: upline.B,
    },
    {
      level: "C",
      user: upline.C,
    },
  ];

  const results = [];

  for (const recipient of recipients) {
    if (!recipient.user) {
      continue;
    }

    const recipientLevel =
      Number(recipient.user.teamLevel) || 1;

    const rates =
      TEAM_COMMISSION_RATES[recipientLevel];

    const rate = rates?.[recipient.level] || 0;

    if (rate <= 0) {
      continue;
    }

    const commissionAmount =
      Math.round(
        amount * (rate / 100) * 100
      ) / 100;

    if (commissionAmount <= 0) {
      continue;
    }

    const wallet = await creditWallet(
      recipient.user._id,
      commissionAmount,
      session
    );

    const [income] = await TeamIncome.create(
      [
        {
          user: recipient.user._id,
          sourceUser: sourceUserId,
          teamLevel: recipient.level,
          sourceAmount: amount,
          rate,
          amount: commissionAmount,
          type: "TEAM_COMMISSION",
          referenceId,
          status: "COMPLETED",
          description:
            `Level ${recipient.level} team commission`,
        },
      ],
      session ? { session } : {}
    );

    results.push({
      level: recipient.level,
      user: recipient.user._id,
      amount: commissionAmount,
      rate,
      walletId: wallet._id,
      incomeId: income._id,
    });
  }

  return {
    success: true,
    sourceAmount: amount,
    commissions: results,
  };
};

export {
  getUpline,
  processReferralBonus,
  processTeamCommission,
};