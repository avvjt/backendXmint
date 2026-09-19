import WalletCounter from "../models/walletCounter.model.js";

const getNextWalletIndex = async () => {
  const counter = await WalletCounter.findOneAndUpdate(
    {
      name: "BSC_DEPOSIT",
    },
    {
      $inc: {
        nextIndex: 1,
      },
    },
    {
      new: false,
      upsert: true,
      setDefaultsOnInsert: true,
    }
  );

  if (!counter) {
    return 0;
  }

  return counter.nextIndex;
};

export default getNextWalletIndex;