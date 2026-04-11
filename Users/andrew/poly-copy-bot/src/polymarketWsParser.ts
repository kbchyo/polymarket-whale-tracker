import type { WhaleTrade } from "./types.js";
import { normalizeTradeRow } from "./polymarket.js";

/**
 * Best-effort parser for Polymarket/data websocket payloads.
 * Accepts several common envelope shapes and extracts trade-like rows.
 */
export function extractTradesFromWsMessage(raw: unknown): WhaleTrade[] {
  const candidates: any[] = [];

  const pushIfTradeLike = (obj: any) => {
    if (!obj || typeof obj !== "object") return;
    if (
      obj.side != null ||
      obj.price != null ||
      obj.tokenID != null ||
      obj.tokenId != null ||
      obj.asset != null
    ) {
      candidates.push(obj);
    }
  };

  const walk = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (typeof node !== "object") return;

    // Common wrappers
    if (Array.isArray(node.trades)) {
      for (const t of node.trades) pushIfTradeLike(t);
    }
    if (Array.isArray(node.data)) {
      for (const t of node.data) pushIfTradeLike(t);
    }

    pushIfTradeLike(node);

    // Recurse one layer through object props for nested envelopes
    for (const value of Object.values(node)) {
      if (value && typeof value === "object") {
        if (Array.isArray(value)) {
          for (const item of value) pushIfTradeLike(item);
        } else {
          pushIfTradeLike(value);
        }
      }
    }
  };

  walk(raw);

  // Deduplicate by derived id
  const out: WhaleTrade[] = [];
  const seen = new Set<string>();
  for (const row of candidates) {
    const t = normalizeTradeRow(row);
    if (!t.id || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
  }

  return out;
}
