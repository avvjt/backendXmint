
const COINGECKO_URL =
  "https://api.coingecko.com/api/v3/simple/price";

const CACHE_DURATION = 60 * 1000;
const MAX_PRICE_AGE = 15 * 60 * 1000;

let cachedQuote = null;

export const getUsdtInrRate = async () => {
  // Reuse a recently fetched quote to avoid unnecessary API calls.
  if (
    cachedQuote &&
    Date.now() - cachedQuote.fetchedAtMs < CACHE_DURATION
  ) {
    return cachedQuote.data;
  }

  const apiKey = process.env.COINGECKO_DEMO_API_KEY;

  if (!apiKey) {
    throw new Error("COINGECKO_DEMO_API_KEY is not configured.");
  }

  const url = new URL(COINGECKO_URL);

  url.searchParams.set("ids", "tether");
  url.searchParams.set("vs_currencies", "inr");
  url.searchParams.set("include_last_updated_at", "true");

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
      "x-cg-demo-api-key": apiKey,
    },
    signal: AbortSignal.timeout(8000),
  });

  if (!response.ok) {
    throw new Error(
      `CoinGecko API request failed: HTTP ${response.status}`
    );
  }

  const result = await response.json();

  const rate = Number(result?.tether?.inr);
  const updatedAt = Number(result?.tether?.last_updated_at);

  if (
    !Number.isFinite(rate) ||
    rate <= 0 ||
    !Number.isFinite(updatedAt) ||
    updatedAt <= 0
  ) {
    throw new Error("Invalid USDT/INR price received.");
  }

  const marketUpdatedAt = new Date(updatedAt * 1000);

  if (
    Date.now() - marketUpdatedAt.getTime() >
    MAX_PRICE_AGE
  ) {
    throw new Error("The USDT/INR market price is outdated.");
  }

  const quote = {
    rate,
    currency: "INR",
    asset: "USDT",
    source: "CoinGecko",
    fetchedAt: new Date(),
    marketUpdatedAt,
  };

  cachedQuote = {
    data: quote,
    fetchedAtMs: Date.now(),
  };

  return quote;
};
