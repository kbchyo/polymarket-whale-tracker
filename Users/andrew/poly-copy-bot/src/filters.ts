import type { MarketInfo, WhaleTrade } from "./types.js";
import { config } from "./config.js";

const CRYPTO_KEYWORDS = [
  "bitcoin",
  "btc",
  "ethereum",
  "eth",
  "solana",
  "sol",
  "crypto",
  "polygon",
  "matic",
  "dogecoin",
  "doge",
  "xrp",
  "cardano",
  "ada",
  "sui",
  "aptos",
  "trump coin",
  "memecoin"
];

export function isLargeEnough(trade: WhaleTrade): boolean {
  const value = trade.usdcSize ?? trade.size ?? 0;
  return value >= config.minUsdcSize;
}

export function isRecentTrade(trade: WhaleTrade, maxAgeMs = config.maxTradeAgeMs): boolean {
  if (trade.timestamp == null) return false;

  const raw = trade.timestamp as unknown;
  const t =
    typeof raw === "number"
      ? raw < 1e12
        ? raw * 1000
        : raw
      : new Date(String(raw)).getTime();

  if (Number.isNaN(t)) return false;
  return Date.now() - t <= maxAgeMs;
}

export function isCryptoMarket(market: MarketInfo | null, trade: WhaleTrade): boolean {
  const text = [
    market?.question ?? "",
    trade.title ?? "",
    trade.market ?? "",
    trade.slug ?? "",
    market?.slug ?? "",
    ...(market?.tags ?? [])
  ]
    .join(" ")
    .toLowerCase();

  return CRYPTO_KEYWORDS.some((k) => text.includes(k));
}

export type CopyDecision =
  | { ok: true }
  | { ok: false; reason: "too_small" | "stale" | "non_crypto" };

export function shouldCopyDecision(trade: WhaleTrade, market: MarketInfo | null): CopyDecision {
  if (!isLargeEnough(trade)) return { ok: false, reason: "too_small" };
  if (!isRecentTrade(trade)) return { ok: false, reason: "stale" };
  if (!isCryptoMarket(market, trade)) return { ok: false, reason: "non_crypto" };
  return { ok: true };
}

export function shouldCopy(trade: WhaleTrade, market: MarketInfo | null): boolean {
  return shouldCopyDecision(trade, market).ok;
}