import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { getRecentTradesForUser } from "./polymarket.js";
import { isLargeEnough, isRecentTrade, shouldCopyDecision } from "./filters.js";
import { PaperTrader } from "./paperTrader.js";
import { HybridWhaleFeed, PollingWhaleFeed, WebsocketTriggeredWhaleFeed } from "./feed.js";
import type { WhaleTrade } from "./types.js";

const seen = new Map<string, number>();
const semanticSeen = new Map<string, number>();
const signalCooldownByToken = new Map<string, number>();
const paperTrader = new PaperTrader(config.paperTradeSizeUsdc);
const whaleSet = new Set(config.whales.map((w) => w.toLowerCase()));

const metrics = {
  tradesIn: 0,
  duplicateById: 0,
  duplicateSemantic: 0,
  cooldownSkipped: 0,
  capacitySkipped: 0,
  decisionRejected: 0,
  topNSkipped: 0,
  positionLossBlocked: 0,
  signalsPassed: 0,
  bySource: {
    poll: 0,
    ws: 0
  },
  shadow: {
    pollFirst: 0,
    wsFirst: 0,
    nearSimul: 0
  }
};

const firstSeenById = new Map<string, { source: "poll" | "ws"; ts: number }>();
const topTokensByWhale = new Map<string, Set<string>>();
const lastSideByToken = new Map<string, { side: "BUY" | "SELL"; ts: number }>();
const processLatencyMs: number[] = [];
const marketFetchLatencyMs: number[] = [];

function recordLatency(list: number[], value: number) {
  if (!Number.isFinite(value) || value < 0) return;
  list.push(value);
  if (list.length > 500) list.shift();
}

function p90(list: number[]): number {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  const idx = Math.floor(0.9 * (s.length - 1));
  return s[idx] ?? 0;
}

const statePath = path.resolve(config.stateFile);
let riskState = {
  day: new Date().toISOString().slice(0, 10),
  openedStakeUsdc: 0
};
let dirtyState = false;
let bankrollEmptyNotified = false;

function ensureDayBoundary() {
  const day = new Date().toISOString().slice(0, 10);
  if (riskState.day !== day) {
    riskState = { day, openedStakeUsdc: 0 };
  }
}

function loadState() {
  try {
    if (!fs.existsSync(statePath)) return;
    const raw = JSON.parse(fs.readFileSync(statePath, "utf-8"));
    for (const [k, v] of raw.seen ?? []) seen.set(k, v);
    for (const [k, v] of raw.semanticSeen ?? []) semanticSeen.set(k, v);
    for (const [k, v] of raw.signalCooldownByToken ?? []) signalCooldownByToken.set(k, v);
    paperTrader.restore(raw.paperTrader);
    if (raw.metrics) Object.assign(metrics, raw.metrics);
    if (raw.riskState) riskState = raw.riskState;
  } catch (err) {
    console.error("state load failed:", err);
  }
}

function saveState() {
  try {
    ensureDayBoundary();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    const payload = {
      seen: [...seen.entries()].slice(-2000),
      semanticSeen: [...semanticSeen.entries()].slice(-4000),
      signalCooldownByToken: [...signalCooldownByToken.entries()].slice(-2000),
      paperTrader: paperTrader.snapshot(),
      metrics,
      riskState
    };
    fs.writeFileSync(statePath, JSON.stringify(payload, null, 2));
    dirtyState = false;
  } catch (err) {
    console.error("state save failed:", err);
  }
}

function pruneSeen(maxAgeMs = 10 * 60_000) {
  const now = Date.now();
  for (const [key, ts] of seen.entries()) {
    if (now - ts > maxAgeMs) seen.delete(key);
  }
  for (const [key, ts] of semanticSeen.entries()) {
    if (now - ts > config.semanticSeenTtlMs) semanticSeen.delete(key);
  }
  for (const [key, ts] of signalCooldownByToken.entries()) {
    if (now - ts > config.signalCooldownMs * 6) signalCooldownByToken.delete(key);
  }
}

function markSeen(id: string) {
  seen.set(id, Date.now());
}

function isSeen(id: string): boolean {
  return seen.has(id);
}

function fmt(trade: WhaleTrade) {
  return {
    whale: trade.user,
    side: trade.side,
    price: trade.price,
    size: trade.size,
    usdcSize: trade.usdcSize,
    outcome: trade.outcome,
    title: trade.title,
    slug: trade.slug,
    tokenId: trade.tokenId,
    timestamp: trade.timestamp
  };
}

function semanticKey(trade: WhaleTrade): string {
  const whale = (trade.user ?? "unknown").toLowerCase();
  const token = trade.tokenId ?? "no-token";
  const side = (trade.side ?? "").toUpperCase();
  const ts = trade.timestamp ?? "no-ts";
  const price = trade.price != null ? Number(trade.price).toFixed(4) : "na";
  return `${whale}:${token}:${side}:${ts}:${price}`;
}

async function refreshTopWeightedTokens() {
  if (config.topNWeightedPositions <= 0) return;

  for (const whale of config.whales) {
    try {
      const trades = await getRecentTradesForUser(whale, 200);
      const weighted = new Map<string, number>();

      for (const t of trades) {
        if (!t.tokenId) continue;
        const px = t.price ?? 0;
        const notion = t.usdcSize ?? ((t.size ?? 0) * (px > 0 ? px : 1));
        if (!Number.isFinite(notion) || notion <= 0) continue;
        weighted.set(t.tokenId, (weighted.get(t.tokenId) ?? 0) + notion);
      }

      const top = [...weighted.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, config.topNWeightedPositions)
        .map(([tokenId]) => tokenId);

      topTokensByWhale.set(whale, new Set(top));
      console.log(`[TOP_N] ${whale.slice(0, 10)}... topN=${config.topNWeightedPositions} tokens=${top.length}`);
    } catch (err) {
      console.error(`[TOP_N] refresh failed for ${whale}:`, err);
    }
  }
}

async function processTrade(trade: WhaleTrade, source: "poll" | "ws" = "poll") {
  const t0 = Date.now();
  const finish = () => recordLatency(processLatencyMs, Date.now() - t0);

  metrics.tradesIn += 1;
  metrics.bySource[source] += 1;

  const now = Date.now();
  if (trade.id) {
    const prev = firstSeenById.get(trade.id);
    if (!prev) {
      firstSeenById.set(trade.id, { source, ts: now });
    } else if (prev.source !== source) {
      const dt = Math.abs(now - prev.ts);
      if (dt <= 1500) {
        metrics.shadow.nearSimul += 1;
      } else if (prev.source === "ws") {
        metrics.shadow.wsFirst += 1;
      } else {
        metrics.shadow.pollFirst += 1;
      }
      firstSeenById.delete(trade.id);
    }
  }

  if (!trade.id || isSeen(trade.id)) {
    metrics.duplicateById += 1;
    finish();
    return;
  }

  const tradeWhale = (trade.user ?? "").toLowerCase();
  if (!tradeWhale || !whaleSet.has(tradeWhale)) {
    markSeen(trade.id);
    finish();
    return;
  }

  const sideUpper = String(trade.side ?? "").toUpperCase();
  if (config.copyOnlyWhaleBuys && sideUpper !== "BUY") {
    metrics.decisionRejected += 1;
    markSeen(trade.id);
    finish();
    return;
  }

  const whaleNotional =
    trade.usdcSize != null
      ? Number(trade.usdcSize)
      : Number((trade.size ?? 0) * (trade.price ?? 0));
  if (config.minWhaleNotionalUsdc > 0 && (!Number.isFinite(whaleNotional) || whaleNotional < config.minWhaleNotionalUsdc)) {
    metrics.decisionRejected += 1;
    markSeen(trade.id);
    finish();
    return;
  }

  const tokenForFlip = trade.tokenId ?? "";
  if (config.flipSuppressMs > 0 && tokenForFlip && (sideUpper === "BUY" || sideUpper === "SELL")) {
    const flipKey = `${tradeWhale}:${tokenForFlip}`;
    const prev = lastSideByToken.get(flipKey);
    const nowTs = Date.now();
    if (prev && prev.side !== (sideUpper as "BUY" | "SELL") && nowTs - prev.ts < config.flipSuppressMs) {
      metrics.decisionRejected += 1;
      markSeen(trade.id);
      finish();
      return;
    }
    lastSideByToken.set(flipKey, { side: sideUpper as "BUY" | "SELL", ts: nowTs });
  }

  if (config.topNWeightedPositions > 0) {
    const allowed = topTokensByWhale.get(tradeWhale);
    if (allowed && trade.tokenId && !allowed.has(trade.tokenId)) {
      metrics.topNSkipped += 1;
      markSeen(trade.id);
      finish();
      return;
    }
  }

  const sKey = semanticKey(trade);
  if (semanticSeen.has(sKey)) {
    metrics.duplicateSemantic += 1;
    markSeen(trade.id);
    finish();
    return;
  }

  // Cheap prechecks before enrichment network calls.
  if (!isLargeEnough(trade) || !isRecentTrade(trade)) {
    metrics.decisionRejected += 1;
    semanticSeen.set(sKey, now);
    markSeen(trade.id);
    finish();
    return;
  }

  // Ultra-low-latency mode: skip per-trade market enrichment in hot path.
  // shouldCopyDecision still applies size/recency and can infer crypto from trade fields.
  const mf0 = Date.now();
  const market = null;
  recordLatency(marketFetchLatencyMs, Date.now() - mf0);

  paperTrader.markToMarket(trade);
  dirtyState = true;

  const tokenIdForRules = trade.tokenId ?? "";
  if (tokenIdForRules) {
    const openPos = paperTrader.getOpenPosition(tradeWhale, tokenIdForRules);
    if (openPos) {
      const nowIso = new Date().toISOString();
      const nowMs = Date.now();
      const entryMs = Date.parse(openPos.entryTime);
      const ageMs = Number.isNaN(entryMs) ? 0 : nowMs - entryMs;
      const pnlUsdcNow =
        openPos.side === "BUY"
          ? (openPos.lastPrice - openPos.entryPrice) * openPos.shares
          : (openPos.entryPrice - openPos.lastPrice) * openPos.shares;
      const pnlPct = openPos.stakeUsdc > 0 ? (100 * pnlUsdcNow) / openPos.stakeUsdc : 0;

      if (config.stopLossPct > 0 && pnlPct <= -Math.abs(config.stopLossPct)) {
        if (paperTrader.closePosition(tradeWhale, tokenIdForRules, openPos.lastPrice, nowIso, "stop_loss")) {
          dirtyState = true;
          finish();
          return;
        }
      }

      if (config.takeProfitPct > 0 && pnlPct >= Math.abs(config.takeProfitPct)) {
        if (paperTrader.closePosition(tradeWhale, tokenIdForRules, openPos.lastPrice, nowIso, "take_profit")) {
          dirtyState = true;
          finish();
          return;
        }
      }

      if (config.staleCloseMs > 0 && ageMs > config.staleCloseMs) {
        if (paperTrader.closePosition(tradeWhale, tokenIdForRules, openPos.lastPrice, nowIso, "stale_close")) {
          dirtyState = true;
          finish();
          return;
        }
      }
    }
  }

  const decision = shouldCopyDecision(trade, market);
  if (!decision.ok) {
    metrics.decisionRejected += 1;
    semanticSeen.set(sKey, Date.now());
    markSeen(trade.id);
    finish();
    return;
  }

  const tokenKey = `${tradeWhale}:${trade.tokenId ?? "no-token"}`;
  const now2 = Date.now();
  const last = signalCooldownByToken.get(tokenKey) ?? 0;
  if (now2 - last < config.signalCooldownMs) {
    metrics.cooldownSkipped += 1;
    semanticSeen.set(sKey, now2);
    markSeen(trade.id);
    finish();
    return;
  }

  if (config.marketPositionCapUsdc > 0) {
    const snap = paperTrader.snapshot();
    const token = trade.tokenId ?? "";
    let tokenExposure = 0;
    for (const [k, pos] of snap.openPositions) {
      if (k !== `${tradeWhale}:${token}`) continue;
      tokenExposure += pos.shares * pos.entryPrice;
    }
    if (tokenExposure + config.paperTradeSizeUsdc > config.marketPositionCapUsdc) {
      metrics.capacitySkipped += 1;
      semanticSeen.set(sKey, now2);
      markSeen(trade.id);
      finish();
      return;
    }
  }

  if (
    config.maxOpenPositions > 0 &&
    paperTrader.getOpenPositionCount() >= config.maxOpenPositions
  ) {
    metrics.capacitySkipped += 1;
    semanticSeen.set(sKey, now2);
    markSeen(trade.id);
    finish();
    return;
  }

  const tokenId = trade.tokenId ?? "";
  if (tokenId) {
    const tokenRealized = paperTrader.getRealizedPnlForPosition(tradeWhale, tokenId);
    if (tokenRealized <= -Math.abs(config.maxLossPerPositionUsdc)) {
      metrics.positionLossBlocked += 1;
      semanticSeen.set(sKey, now2);
      markSeen(trade.id);
      finish();
      return;
    }
  }

  ensureDayBoundary();
  const summary = paperTrader.getSummary();
  if (summary.totalPnl <= -Math.abs(config.maxDailyLossUsdc)) {
    metrics.capacitySkipped += 1;
    semanticSeen.set(sKey, now2);
    markSeen(trade.id);
    finish();
    return;
  }

  if (
    config.maxDailyStakeUsdc > 0 &&
    riskState.openedStakeUsdc + config.paperTradeSizeUsdc > config.maxDailyStakeUsdc
  ) {
    metrics.capacitySkipped += 1;
    semanticSeen.set(sKey, now2);
    markSeen(trade.id);
    finish();
    return;
  }

  if (config.startingBankrollUsdc > 0) {
    const summary = paperTrader.getSummary();
    const equityNow = config.startingBankrollUsdc + summary.totalPnl;
    if (equityNow < config.paperTradeSizeUsdc) {
      metrics.capacitySkipped += 1;
      semanticSeen.set(sKey, now2);
      markSeen(trade.id);
      if (!bankrollEmptyNotified) {
        bankrollEmptyNotified = true;
        console.warn(
          `[BANKROLL_EMPTY] equity=${equityNow.toFixed(2)} < tradeSize=${config.paperTradeSizeUsdc.toFixed(2)}; blocking new entries.`
        );
      }
      finish();
      return;
    }
    bankrollEmptyNotified = false;
  }

  metrics.signalsPassed += 1;
  console.log("\n=== COPY SIGNAL ===");
  console.log(JSON.stringify(fmt(trade), null, 2));
  console.log("marketTags:", market?.tags ?? []);
  console.log("===================\n");

  paperTrader.onSignal(trade);
  riskState.openedStakeUsdc += config.paperTradeSizeUsdc;
  signalCooldownByToken.set(tokenKey, now2);
  semanticSeen.set(sKey, now2);
  markSeen(trade.id);
  dirtyState = true;
  finish();
}

async function discoverInitialAssetIds(): Promise<string[]> {
  const ids = new Set<string>();
  for (const whale of config.whales) {
    try {
      const { getRecentTradesForUser } = await import("./polymarket.js");
      const trades = await getRecentTradesForUser(whale, 40);
      for (const t of trades) {
        if (t.tokenId) ids.add(String(t.tokenId));
      }
    } catch {
      // ignore per-whale bootstrap errors
    }
  }
  return [...ids].slice(0, 200);
}

async function createWsFeed() {
  if (!config.wsUrl) {
    throw new Error("FEED_MODE=ws/shadow requires POLYMARKET_WS_URL");
  }

  const assetIds = config.wsAssetIds.length > 0 ? config.wsAssetIds : await discoverInitialAssetIds();
  console.log(`[WS] subscribing with ${assetIds.length} asset ids`);

  return new WebsocketTriggeredWhaleFeed(
    config.whales,
    config.pollMs,
    config.whaleTradeFetchLimit,
    config.wsUrl,
    assetIds,
    config.wsTriggerCooldownMs
  );
}

async function main() {
  console.log("Starting Polymarket whale watcher...");
  console.log("Whales:", config.whales);
  console.log("Feed mode:", config.feedMode);
  if (config.feedMode === "poll") {
    console.log("Poll ms:", config.pollMs);
  } else {
    console.log("WS URL:", config.wsUrl);
    if (config.feedMode === "shadow") {
      console.log("Shadow mode: running websocket-triggered + polling feeds in parallel");
    }
    if (config.feedMode === "hybrid") {
      console.log("Hybrid mode: websocket-triggered feed + activity/trades reconciliation feed");
    }
  }
  console.log("Min size:", config.minUsdcSize);
  console.log("Live trading:", config.liveTrading);
  console.log("Paper trade size:", config.paperTradeSizeUsdc);
  console.log("Risk caps:", {
    maxOpenPositions: config.maxOpenPositions,
    maxDailyLossUsdc: config.maxDailyLossUsdc,
    maxDailyStakeUsdc: config.maxDailyStakeUsdc,
    marketPositionCapUsdc: config.marketPositionCapUsdc,
    startingBankrollUsdc: config.startingBankrollUsdc
  });
  console.log("Execution filters:", {
    copyOnlyWhaleBuys: config.copyOnlyWhaleBuys,
    maxTradeAgeMs: config.maxTradeAgeMs,
    minWhaleNotionalUsdc: config.minWhaleNotionalUsdc,
    flipSuppressMs: config.flipSuppressMs,
    stopLossPct: config.stopLossPct,
    takeProfitPct: config.takeProfitPct,
    staleCloseMs: config.staleCloseMs
  });

  loadState();
  await refreshTopWeightedTokens();

  setInterval(() => {
    void refreshTopWeightedTokens();
    pruneSeen();
    paperTrader.printSummary();
    const s = paperTrader.getSummary();
    const procP90 = p90(processLatencyMs).toFixed(1);
    const mktP90 = p90(marketFetchLatencyMs).toFixed(1);
    const equityNow =
      config.startingBankrollUsdc > 0 ? config.startingBankrollUsdc + s.totalPnl : null;
    console.log(
      `[METRICS] in=${metrics.tradesIn} pass=${metrics.signalsPassed} ` +
        `dupId=${metrics.duplicateById} dupSem=${metrics.duplicateSemantic} ` +
        `cooldown=${metrics.cooldownSkipped} capacity=${metrics.capacitySkipped} topN=${metrics.topNSkipped} ` +
        `posLossBlock=${metrics.positionLossBlocked} rejected=${metrics.decisionRejected} ` +
        `src={ws:${metrics.bySource.ws},poll:${metrics.bySource.poll}} ` +
        `shadow={wsFirst:${metrics.shadow.wsFirst},pollFirst:${metrics.shadow.pollFirst},near:${metrics.shadow.nearSimul}} ` +
        `latencyMs={procP90:${procP90},marketP90:${mktP90}} ` +
        `risk={dayStake:${riskState.openedStakeUsdc.toFixed(2)},totalPnl:${s.totalPnl.toFixed(2)}}` +
        (equityNow != null ? ` bankroll={start:${config.startingBankrollUsdc.toFixed(2)},equity:${equityNow.toFixed(2)}}` : "")
    );
    saveState();
  }, 30_000);

  const attachFeed = (source: "poll" | "ws", feed: { on: Function; start: () => Promise<void> }) => {
    feed.on("trade", (trade: WhaleTrade) => {
      void processTrade(trade, source).catch((err) => {
        console.error(`trade processing error (${source}):`, err);
      });
    });

    feed.on("error", (err: unknown) => {
      console.error(`feed error (${source}):`, err);
    });

    return feed.start();
  };

  if (config.feedMode === "poll") {
    const pollFeed = new PollingWhaleFeed(config.whales, config.pollMs, config.whaleTradeFetchLimit);
    await attachFeed("poll", pollFeed);
    return;
  }

  if (config.feedMode === "ws") {
    const wsFeed = await createWsFeed();
    await attachFeed("ws", wsFeed);
    return;
  }

  if (config.feedMode === "hybrid") {
    const wsFeed = await createWsFeed();
    const hybridFeed = new HybridWhaleFeed(
      config.whales,
      Math.max(config.pollMs, 5000),
      Math.max(config.whaleTradeFetchLimit, 5)
    );
    await Promise.all([attachFeed("ws", wsFeed), attachFeed("poll", hybridFeed)]);
    return;
  }

  // shadow mode: run both for parity/latency metrics
  const wsFeed = await createWsFeed();
  const pollFeed = new PollingWhaleFeed(
    config.whales,
    Math.max(config.pollMs, 2000),
    config.whaleTradeFetchLimit
  );
  await Promise.all([attachFeed("ws", wsFeed), attachFeed("poll", pollFeed)]);
}

process.on("SIGINT", () => {
  saveState();
  process.exit(0);
});

process.on("SIGTERM", () => {
  saveState();
  process.exit(0);
});

main().catch((err) => {
  console.error(err);
  saveState();
  process.exit(1);
});
