import { EventEmitter } from "node:events";
import type { WhaleTrade } from "./types.js";
import type { TradeFeed, TradeFeedEvents } from "./feed.js";

export type TradeExtractor = (rawMessage: unknown) => WhaleTrade[];

/**
 * Generic websocket trade feed adapter.
 *
 * Why generic:
 * - Polymarket websocket payload shapes can differ by channel.
 * - Keep parsing logic pluggable so strategy code stays stable.
 */
export class WebSocketTradeFeed extends EventEmitter implements TradeFeed {
  private ws: WebSocket | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(
    private readonly wsUrl: string,
    private readonly extractTrades: TradeExtractor,
    private readonly reconnectMs = 2000
  ) {
    super();
  }

  async start(): Promise<void> {
    this.stopping = false;
    this.connect();
  }

  async stop(): Promise<void> {
    this.stopping = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.ws) this.ws.close();
    this.ws = null;
  }

  private connect() {
    this.ws = new WebSocket(this.wsUrl);

    this.ws.onopen = () => {
      // Subscription messages (if needed) should be sent by caller-specific wrappers.
      this.emit("open");
    };

    this.ws.onmessage = (ev) => {
      try {
        const raw = typeof ev.data === "string" ? JSON.parse(ev.data) : ev.data;
        const trades = this.extractTrades(raw);
        for (const t of trades) this.emit("trade", t);
      } catch (err) {
        this.emit("error", err);
      }
    };

    this.ws.onerror = (err) => {
      this.emit("error", err);
    };

    this.ws.onclose = () => {
      if (this.stopping) return;
      this.reconnectTimer = setTimeout(() => this.connect(), this.reconnectMs);
    };
  }

  override on<E extends keyof TradeFeedEvents | "open">(
    event: E,
    listener: E extends keyof TradeFeedEvents ? TradeFeedEvents[E] : () => void
  ): this {
    return super.on(event, listener as any);
  }
}
