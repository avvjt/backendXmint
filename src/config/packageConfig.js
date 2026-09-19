export const PACKAGE_CONFIG = {
  STARTER: {
    name: "Starter",
    minBalance: 50,
    maxBalance: 200,
    dailyRate: 1,
  },

  PRO: {
    name: "Pro",
    minBalance: 201,
    maxBalance: 1000,
    dailyRate: 1.5,
  },

  MASTER: {
    name: "Master",
    minBalance: 1001,
    maxBalance: 2000,
    dailyRate: 2.5,
  },

  ELITE: {
    name: "Elite",
    minBalance: 2001,
    maxBalance: 4500,
    dailyRate: 3,
  },

  EMPIRE: {
    name: "Empire",
    minBalance: 4501,
    maxBalance: 10000,
    dailyRate: 3.3,
  },
};

export const getPackageByBalance = (balance) => {
  const amount = Number(balance);

  if (!Number.isFinite(amount) || amount < 0) {
    return null;
  }

  const packages = Object.entries(PACKAGE_CONFIG);

  for (let i = 0; i < packages.length; i++) {
    const [key, packageInfo] = packages[i];
    const nextPackage = packages[i + 1]?.[1];

    const isAboveMinimum = amount >= packageInfo.minBalance;
    const isBelowNextMinimum =
      !nextPackage || amount < nextPackage.minBalance;

    if (isAboveMinimum && isBelowNextMinimum) {
      return {
        key,
        ...packageInfo,
      };
    }
  }

  return null;
};