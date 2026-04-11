import { EventEmitter } from "node:events";
import { getRecentActivityForUser, getRecentTradesForUser } from "./polymarket.js";
import type { WhaleTrade } from "./types.js";

export type TradeFeedEvents = {
  trade: (trade: WhaleTrade) => void;
  error: (err: unknown) => void;
};

export interface TradeFeed {
  start(): Promise<void>;
  stop(): Promise<void>;
  on<E extends keyof TradeFeedEvents>(event: E, listener: TradeFeedEvents[E]): this;
}

/**
 * Polling implementation (current behavior) wrapped as an event feed.
 * Useful as fallback and for parity testing against websocket feeds.
 */
function toMs(ts?: string): number {
  if (!ts) return 0;
  const n = Date.parse(ts);
  return Number.isNaN(n) ? 0 : n;
}

export class PollingWhaleFeed extends EventEmitter implements TradeFeed {
  private timer: NodeJS.Timeout | null = null;
  protected readonly seen = new Set<string>();
  protected readonly lastTradeTsByWhale = new Map<string, number>();

  constructor(
    protected readonly whales: string[],
    protected readonly pollMs: number,
    protected readonly limitPerWhale = 20
  ) {
    super();
  }

  protected async pollWhalesOnce() {
    for (const whale of this.whales) {
      const trades = await getRecentTradesForUser(whale, this.limitPerWhale);
      const lastTs = this.lastTradeTsByWhale.get(whale) ?? 0;

      // Process newest->oldest to minimize actionable latency under burst/backlog.
      const ordered = [...trades].sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
      let maxTs = lastTs;

      for (const trade of ordered) {
        const ts = toMs(trade.timestamp);
        if (ts && ts < lastTs) continue;
        if (this.seen.has(trade.id)) continue;

        this.seen.add(trade.id);
        this.emit("trade", trade);
        if (ts > maxTs) maxTs = ts;
      }

      if (maxTs > lastTs) this.lastTradeTsByWhale.set(whale, maxTs);
    }
  }

  async start(): Promise<void> {
    if (this.timer) return;

    const tick = async () => {
      try {
        await this.pollWhalesOnce();
      } catch (err) {
        this.emit("error", err);
      }
    };

    await tick();
    this.timer = setInterval(() => {
      void tick();
    }, this.pollMs);
  }

  async stop(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  override on<E extends keyof TradeFeedEvents>(event: E, listener: TradeFeedEvents[E]): this {
    return super.on(event, listener as any);
  }
}

export class HybridWhaleFeed extends PollingWhaleFeed {
  protected override async pollWhalesOnce() {
    for (const whale of this.whales) {
      const [activity, trades] = await Promise.all([
        getRecentActivityForUser(whale, this.limitPerWhale).catch(() => []),
        getRecentTradesForUser(whale, this.limitPerWhale).catch(() => [])
      ]);
      const merged = [...activity, ...trades];
      const byId = new Map<string, WhaleTrade>();
      for (const t of merged) {
        if (!t?.id) continue;
        const prev = byId.get(t.id);
        if (!prev) {
          byId.set(t.id, t);
          continue;
        }
        if (toMs(t.timestamp) > toMs(prev.timestamp)) byId.set(t.id, t);
      }

      const lastTs = this.lastTradeTsByWhale.get(whale) ?? 0;
      const ordered = [...byId.values()].sort((a, b) => toMs(b.timestamp) - toMs(a.timestamp));
      let maxTs = lastTs;

      for (const trade of ordered) {
        const ts = toMs(trade.timestamp);
        if (ts && ts < lastTs) continue;
        if (this.seen.has(trade.id)) continue;

        this.seen.add(trade.id);
        this.emit("trade", trade);
        if (ts > maxTs) maxTs = ts;
      }

      if (maxTs > lastTs) this.lastTradeTsByWhale.set(whale, maxTs);
    }
  }
}

/**
 * Websocket-triggered whale polling:
 * - subscribes to Polymarket market websocket for low-latency ticks
 * - on each message burst, quickly refreshes whale trades via REST
 * This keeps whale attribution accurate while improving detection latency.
 */
export class WebsocketTriggeredWhaleFeed extends PollingWhaleFeed {
  private ws: WebSocket | null = null;
  private fallbackTimer: NodeJS.Timeout | null = null;
  private triggerCooldownUntil = 0;

  constructor(
    whales: string[],
    pollMs: number,
    limitPerWhale: number,
    private readonly wsUrl: string,
    private readonly assetIds: string[] = [],
    private readonly wsTriggerCooldownMs = 400
  ) {
    super(whales, pollMs, limitPerWhale);
  }

  async start(): Promise<void> {
    // initial sweep so startup isn't empty
    try {
      await this.pollWhalesOnce();
    } catch (err) {
      this.emit("error", err);
    }

    this.connectWs();

    // fallback sweep keeps feed alive if ws is quiet/disconnected
    this.fallbackTimer = setInterval(() => {
      void this.pollWhalesOnce().catch((err) => this.emit("error", err));
    }, Math.max(this.pollMs, 10_000));
  }

  async stop(): Promise<void> {
    if (this.fallbackTimer) clearInterval(this.fallbackTimer);
    this.fallbackTimer = null;
    if (this.ws) this.ws.close();
    this.ws = null;
  }

  private connectWs() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      try {
        if (this.assetIds.length > 0) {
          this.ws?.send(
            JSON.stringify({
              type: "market",
              assets_ids: this.assetIds,
              custom_feature_enabled: true
            })
          );
        }
      } catch (err) {
        this.emit("error", err);
      }
    };

    this.ws.onmessage = () => {
      const now = Date.now();
      if (now < this.triggerCooldownUntil) return;
      this.triggerCooldownUntil = now + this.wsTriggerCooldownMs;
      void this.pollWhalesOnce().catch((err) => this.emit("error", err));
    };

    this.ws.onerror = (err) => this.emit("error", err);
    this.ws.onclose = () => {
      setTimeout(() => this.connectWs(), 2000);
    };
  }
}
