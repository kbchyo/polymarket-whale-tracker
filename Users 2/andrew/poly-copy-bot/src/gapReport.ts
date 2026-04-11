import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import type { ClosedPaperTrade, PaperPosition } from "./types.js";

type AnyState = {
  paperTrader?: {
    openPositions?: Array<[string, PaperPosition]>;
    closedTrades?: ClosedPaperTrade[];
  };
};

function toMs(ts?: string): number | null {
  if (!ts) return null;
  const n = Date.parse(ts);
  return Number.isNaN(n) ? null : n;
}

function pct(x: number): number {
  return Number.isFinite(x) ? x * 100 : 0;
}

function quantile(arr: number[], q: number): number | null {
  if (!arr.length) return null;
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.max(0, Math.min(s.length - 1, Math.floor(q * (s.length - 1))));
  return s[idx];
}

async function main() {
  const statePath = path.resolve(config.stateFile);
  if (!fs.existsSync(statePath)) {
    throw new Error(`State file missing: ${statePath}`);
  }

  const state = JSON.parse(fs.readFileSync(statePath, "utf-8")) as AnyState;
  const openPositions = state.paperTrader?.openPositions ?? [];
  const closedTrades = state.paperTrader?.closedTrades ?? [];

  const instrumentedOpen = openPositions.map(([, p]) => p).filter((p) => p.sourceWhaleTradeId || p.sourceWhaleTradeTs);
  const instrumentedClosed = closedTrades.filter((t) => t.sourceWhaleTradeId || t.sourceWhaleTradeTs);

  const allInstrumented = [
    ...instrumentedOpen.map((p) => ({
      sourceWhaleTradeId: p.sourceWhaleTradeId,
      sourceWhaleTradeTs: p.sourceWhaleTradeTs,
      sourceWhalePrice: p.sourceWhalePrice,
      sourceSignalObservedTs: p.sourceSignalObservedTs,
      entryPrice: p.entryPrice
    })),
    ...instrumentedClosed.map((t) => ({
      sourceWhaleTradeId: t.sourceWhaleTradeId,
      sourceWhaleTradeTs: t.sourceWhaleTradeTs,
      sourceWhalePrice: t.sourceWhalePrice,
      sourceSignalObservedTs: t.sourceSignalObservedTs,
      entryPrice: t.entryPrice
    }))
  ];

  const lagMs: number[] = [];
  const slippagePct: number[] = [];

  for (const x of allInstrumented) {
    const a = toMs(x.sourceWhaleTradeTs);
    const b = toMs(x.sourceSignalObservedTs);
    if (a != null && b != null && b >= a) {
      lagMs.push(b - a);
    }

    if (x.sourceWhalePrice != null && x.sourceWhalePrice > 0) {
      const slip = (x.entryPrice - x.sourceWhalePrice) / x.sourceWhalePrice;
      slippagePct.push(pct(slip));
    }
  }

  const report = {
    stateFile: statePath,
    totals: {
      openPositions: openPositions.length,
      closedTrades: closedTrades.length,
      instrumentedOpen: instrumentedOpen.length,
      instrumentedClosed: instrumentedClosed.length,
      instrumentedTotal: allInstrumented.length
    },
    lagSeconds: {
      samples: lagMs.length,
      median: lagMs.length ? Number((quantile(lagMs, 0.5)! / 1000).toFixed(3)) : null,
      p90: lagMs.length ? Number((quantile(lagMs, 0.9)! / 1000).toFixed(3)) : null,
      max: lagMs.length ? Number((Math.max(...lagMs) / 1000).toFixed(3)) : null
    },
    entrySlippagePct: {
      samples: slippagePct.length,
      median: slippagePct.length ? Number((quantile(slippagePct, 0.5)!).toFixed(4)) : null,
      p90: slippagePct.length ? Number((quantile(slippagePct, 0.9)!).toFixed(4)) : null,
      min: slippagePct.length ? Number(Math.min(...slippagePct).toFixed(4)) : null,
      max: slippagePct.length ? Number(Math.max(...slippagePct).toFixed(4)) : null
    }
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
