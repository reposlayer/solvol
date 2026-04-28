import type { CryptoWindowStats } from "@/lib/domain/types";

const COINGECKO = "https://api.coingecko.com/api/v3";

const SYMBOL_MAP: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  XRP: "ripple",
  DOGE: "dogecoin",
};

export async function fetchCryptoWindowChange(
  ticker: string,
  windowStartSec: number,
  windowEndSec: number,
): Promise<CryptoWindowStats | null> {
  const id = SYMBOL_MAP[ticker.toUpperCase()];
  if (!id) return null;

  const from = Math.floor(windowStartSec);
  const to = Math.ceil(windowEndSec);
  const url = `${COINGECKO}/coins/${id}/market_chart/range?vs_currency=usd&from=${from}&to=${to}`;

  const res = await fetch(url, { next: { revalidate: 120 } });
  if (!res.ok) return null;

  const data = (await res.json()) as { prices?: [number, number][] };
  const prices = data.prices ?? [];
  if (prices.length < 2) return null;

  const start = prices[0]![1];
  const end = prices[prices.length - 1]![1];
  if (!Number.isFinite(start) || !Number.isFinite(end) || start === 0) return null;

  const changePercent = ((end - start) / start) * 100;

  return {
    assetId: id,
    symbol: ticker.toUpperCase(),
    priceStartUsd: start,
    priceEndUsd: end,
    changePercent,
  };
}
