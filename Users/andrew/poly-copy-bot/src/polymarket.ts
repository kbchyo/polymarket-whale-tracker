import type { MarketInfo, WhaleTrade } from "./types.js";
import { config } from "./config.js";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      accept: "application/json"
    }
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status} for ${url}: ${text}`);
  }

  return res.json() as Promise<T>;
}

function pickTradeId(row: any): string {
  return String(
    row.id ??
      row.transactionHash ??
      row.txHash ??
      row.hash ??
      `${row.user ?? row.proxyWallet ?? "unknown"}:${row.slug ?? row.market ?? "market"}:${row.timestamp ?? row.createdAt ?? Date.now()}`
  );
}

export function normalizeTradeRow(row: any): WhaleTrade {
  const rawTs = row.timestamp ?? row.createdAt;
  const normalizedTs =
    typeof rawTs === "number"
      ? new Date(rawTs < 1e12 ? rawTs * 1000 : rawTs).toISOString()
      : rawTs;

  return {
    id: pickTradeId(row),
    user: row.user ?? row.proxyWallet,
    side: row.side,
    price: row.price != null ? Number(row.price) : undefined,
    size: row.size != null ? Number(row.size) : undefined,
    usdcSize:
      row.usdcSize != null
        ? Number(row.usdcSize)
        : row.usdc_size != null
          ? Number(row.usdc_size)
          : undefined,
    outcome: row.outcome,
    title: row.title ?? row.question,
    market: row.market,
    slug: row.slug,
    eventSlug: row.eventSlug,
    conditionId: row.conditionId,
    tokenId: row.tokenID ?? row.tokenId ?? row.asset,
    timestamp: normalizedTs,
    raw: row
  };
}

export async function getRecentTradesForUser(user: string, limit = 30): Promise<WhaleTrade[]> {
  const url = new URL("/trades", config.dataBase);
  url.searchParams.set("user", user);
  url.searchParams.set("limit", String(limit));

  const data = await getJson<any[]>(url.toString());

  return data.map(normalizeTradeRow);
}

export async function getRecentActivityForUser(user: string, limit = 30): Promise<WhaleTrade[]> {
  const url = new URL("/activity", config.dataBase);
  url.searchParams.set("user", user);
  url.searchParams.set("limit", String(limit));

  const data = await getJson<any[]>(url.toString());
  const tradeLike = data.filter((row) => {
    const t = String(row?.type ?? "").toUpperCase();
    const side = String(row?.side ?? "").toUpperCase();
    return t === "TRADE" || side === "BUY" || side === "SELL";
  });

  return tradeLike.map(normalizeTradeRow);
}

export async function getMarketBySlug(slug: string): Promise<MarketInfo | null> {
  const url = new URL("/markets", config.gammaBase);
  url.searchParams.set("slug", slug);

  const data = await getJson<any[]>(url.toString());
  const row = data?.[0];
  if (!row) return null;

  return {
    slug: row.slug ?? slug,
    question: row.question ?? row.title ?? "",
    active: Boolean(row.active),
    closed: Boolean(row.closed),
    archived: Boolean(row.archived),
    tags: Array.isArray(row.tags)
      ? row.tags.map((t: any) => String(t.label ?? t.name ?? t.slug ?? t))
      : []
  };
}