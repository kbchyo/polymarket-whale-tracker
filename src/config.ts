import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing env var: ${name}`);
  return value;
}

export const config = {
  whales: required("WHALE_ADDRESSES")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),

  pollMs: Number(process.env.POLL_MS ?? 500),
  whaleTradeFetchLimit: Number(process.env.WHALE_TRADE_FETCH_LIMIT ?? 10),
  minUsdcSize: Number(process.env.MIN_USDC_SIZE ?? 25),
  maxTradeAgeMs: Number(process.env.MAX_TRADE_AGE_MS ?? 300000),
  liveTrading: (process.env.LIVE_TRADING ?? "false").toLowerCase() === "true",
  paperTradeSizeUsdc: Number(process.env.PAPER_TRADE_SIZE_USDC ?? 25),

  feedMode: (process.env.FEED_MODE ?? "poll").toLowerCase() as "poll" | "ws" | "shadow" | "hybrid",
  wsUrl: process.env.POLYMARKET_WS_URL ?? "",
  wsAssetIds: (process.env.POLYMARKET_WS_ASSET_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  wsTriggerCooldownMs: Number(process.env.WS_TRIGGER_COOLDOWN_MS ?? 400),

  signalCooldownMs: Number(process.env.SIGNAL_COOLDOWN_MS ?? 5000),
  semanticSeenTtlMs: Number(process.env.SEMANTIC_SEEN_TTL_MS ?? 120000),
  copyOnlyWhaleBuys: (process.env.COPY_ONLY_WHALE_BUYS ?? "false").toLowerCase() === "true",
  marketPositionCapUsdc: Number(process.env.MARKET_POSITION_CAP_USDC ?? 0),
  minWhaleNotionalUsdc: Number(process.env.MIN_WHALE_NOTIONAL_USDC ?? 0),
  flipSuppressMs: Number(process.env.FLIP_SUPPRESS_MS ?? 0),
  stopLossPct: Number(process.env.STOP_LOSS_PCT ?? 0),
  takeProfitPct: Number(process.env.TAKE_PROFIT_PCT ?? 0),
  staleCloseMs: Number(process.env.STALE_CLOSE_MS ?? 0),
  maxOpenPositions: Number(process.env.MAX_OPEN_POSITIONS ?? 12),
  maxDailyLossUsdc: Number(process.env.MAX_DAILY_LOSS_USDC ?? 50),
  maxDailyStakeUsdc: Number(process.env.MAX_DAILY_STAKE_USDC ?? 500),
  maxLossPerPositionUsdc: Number(process.env.MAX_LOSS_PER_POSITION_USDC ?? 20),
  topNWeightedPositions: Number(process.env.TOP_N_WEIGHTED_POSITIONS ?? 0),
  startingBankrollUsdc: Number(process.env.STARTING_BANKROLL_USDC ?? 0),
  stateFile: process.env.STATE_FILE ?? ".state/bot-state.json",

  gammaBase: "https://gamma-api.polymarket.com",
  dataBase: "https://data-api.polymarket.com",
  clobBase: "https://clob.polymarket.com"
};