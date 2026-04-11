import type { ClosedPaperTrade, PaperPosition, WhaleTrade } from "./types.js";

function normalizeSide(side?: string): "BUY" | "SELL" | null {
  if (!side) return null;
  const s = side.toUpperCase();
  if (s === "BUY") return "BUY";
  if (s === "SELL") return "SELL";
  return null;
}

function oppositeSide(side: "BUY" | "SELL"): "BUY" | "SELL" {
  return side === "BUY" ? "SELL" : "BUY";
}

function positionKey(whale: string, tokenId: string): string {
  return `${whale}:${tokenId}`;
}

export type PaperTraderState = {
  openPositions: Array<[string, PaperPosition]>;
  closedTrades: ClosedPaperTrade[];
};

export type PaperSummary = {
  openPositions: number;
  closedTrades: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
};

export class PaperTrader {
  private openPositions = new Map<string, PaperPosition>();
  private closedTrades: ClosedPaperTrade[] = [];

  constructor(private readonly tradeSizeUsdc: number) {}

  onSignal(trade: WhaleTrade): void {
    const side = normalizeSide(trade.side);
    const tokenId = trade.tokenId;
    const whale = trade.user;
    const price = trade.price;
    const timestamp = trade.timestamp ?? new Date().toISOString();

    if (!side || !tokenId || !whale || price == null || price <= 0) {
      return;
    }

    const key = positionKey(whale, tokenId);
    const existing = this.openPositions.get(key);

    if (!existing) {
      const shares = this.tradeSizeUsdc / price;

      const position: PaperPosition = {
        tokenId,
        whale,
        marketSlug: trade.slug,
        title: trade.title,
        outcome: trade.outcome,
        side,
        entryPrice: price,
        entryTime: timestamp,
        stakeUsdc: this.tradeSizeUsdc,
        shares,
        open: true,
        lastPrice: price,

        sourceWhaleTradeId: trade.id,
        sourceWhaleTradeTs: trade.timestamp,
        sourceWhalePrice: trade.price,
        sourceSignalObservedTs: new Date().toISOString()
      };

      this.openPositions.set(key, position);

      console.log("\n[PAPER] OPEN");
      console.log(
        JSON.stringify(
          {
            whale,
            tokenId,
            title: trade.title,
            outcome: trade.outcome,
            side,
            entryPrice: price,
            stakeUsdc: this.tradeSizeUsdc,
            shares: Number(shares.toFixed(6)),
            time: timestamp,
            sourceWhaleTradeId: trade.id
          },
          null,
          2
        )
      );
      return;
    }

    existing.lastPrice = price;

    if (side === existing.side) {
      console.log(
        `[PAPER] Update only: same-side signal for ${existing.title ?? tokenId} @ ${price}`
      );
      return;
    }

    const pnlUsdc = this.calculatePnl(existing, price);
    const pnlPct = existing.stakeUsdc === 0 ? 0 : (pnlUsdc / existing.stakeUsdc) * 100;

    const closed: ClosedPaperTrade = {
      tokenId: existing.tokenId,
      whale: existing.whale,
      marketSlug: existing.marketSlug,
      title: existing.title,
      outcome: existing.outcome,
      entrySide: existing.side,
      exitSide: side,
      entryPrice: existing.entryPrice,
      exitPrice: price,
      entryTime: existing.entryTime,
      exitTime: timestamp,
      stakeUsdc: existing.stakeUsdc,
      shares: existing.shares,
      pnlUsdc,
      pnlPct,

      sourceWhaleTradeId: existing.sourceWhaleTradeId,
      sourceWhaleTradeTs: existing.sourceWhaleTradeTs,
      sourceWhalePrice: existing.sourceWhalePrice,
      sourceSignalObservedTs: existing.sourceSignalObservedTs
    };

    this.closedTrades.push(closed);
    this.openPositions.delete(key);

    console.log("\n[PAPER] CLOSE");
    console.log(
      JSON.stringify(
        {
          whale: closed.whale,
          tokenId: closed.tokenId,
          title: closed.title,
          outcome: closed.outcome,
          entrySide: closed.entrySide,
          exitSide: closed.exitSide,
          entryPrice: closed.entryPrice,
          exitPrice: closed.exitPrice,
          pnlUsdc: Number(closed.pnlUsdc.toFixed(4)),
          pnlPct: Number(closed.pnlPct.toFixed(2)),
          entryTime: closed.entryTime,
          exitTime: closed.exitTime,
          sourceWhaleTradeId: closed.sourceWhaleTradeId
        },
        null,
        2
      )
    );
  }

  markToMarket(trade: WhaleTrade): void {
    const tokenId = trade.tokenId;
    const whale = trade.user;
    const price = trade.price;

    if (!tokenId || !whale || price == null || price <= 0) {
      return;
    }

    const key = positionKey(whale, tokenId);
    const existing = this.openPositions.get(key);
    if (!existing) return;

    existing.lastPrice = price;
  }

  getOpenPosition(whale: string, tokenId: string): PaperPosition | undefined {
    return this.openPositions.get(positionKey(whale, tokenId));
  }

  getOpenPositions(): Array<[string, PaperPosition]> {
    return [...this.openPositions.entries()];
  }

  closePosition(
    whale: string,
    tokenId: string,
    exitPrice: number,
    exitTime: string,
    reason = "rule_close"
  ): boolean {
    const key = positionKey(whale, tokenId);
    const existing = this.openPositions.get(key);
    if (!existing || !Number.isFinite(exitPrice) || exitPrice <= 0) return false;

    const exitSide = oppositeSide(existing.side);
    const pnlUsdc = this.calculatePnl(existing, exitPrice);
    const pnlPct = existing.stakeUsdc === 0 ? 0 : (pnlUsdc / existing.stakeUsdc) * 100;

    const closed: ClosedPaperTrade = {
      tokenId: existing.tokenId,
      whale: existing.whale,
      marketSlug: existing.marketSlug,
      title: existing.title,
      outcome: existing.outcome,
      entrySide: existing.side,
      exitSide,
      entryPrice: existing.entryPrice,
      exitPrice,
      entryTime: existing.entryTime,
      exitTime,
      stakeUsdc: existing.stakeUsdc,
      shares: existing.shares,
      pnlUsdc,
      pnlPct,

      sourceWhaleTradeId: existing.sourceWhaleTradeId,
      sourceWhaleTradeTs: existing.sourceWhaleTradeTs,
      sourceWhalePrice: existing.sourceWhalePrice,
      sourceSignalObservedTs: existing.sourceSignalObservedTs
    };

    this.closedTrades.push(closed);
    this.openPositions.delete(key);

    console.log(`\n[PAPER] CLOSE (${reason})`);
    console.log(
      JSON.stringify(
        {
          whale: closed.whale,
          tokenId: closed.tokenId,
          title: closed.title,
          entrySide: closed.entrySide,
          exitSide: closed.exitSide,
          entryPrice: closed.entryPrice,
          exitPrice: closed.exitPrice,
          pnlUsdc: Number(closed.pnlUsdc.toFixed(4)),
          pnlPct: Number(closed.pnlPct.toFixed(2)),
          entryTime: closed.entryTime,
          exitTime: closed.exitTime,
          reason
        },
        null,
        2
      )
    );

    return true;
  }

  getOpenPositionCount(): number {
    return this.openPositions.size;
  }

  getRealizedPnlForPosition(whale: string, tokenId: string): number {
    let pnl = 0;
    for (const t of this.closedTrades) {
      if (t.whale === whale && t.tokenId === tokenId) {
        pnl += t.pnlUsdc;
      }
    }
    return Number(pnl.toFixed(4));
  }

  getSummary(): PaperSummary {
    const open = [...this.openPositions.values()];
    const closed = this.closedTrades;

    const realizedPnl = closed.reduce((sum, t) => sum + t.pnlUsdc, 0);
    const unrealizedPnl = open.reduce((sum, p) => sum + this.calculatePnl(p, p.lastPrice), 0);

    return {
      openPositions: open.length,
      closedTrades: closed.length,
      realizedPnl: Number(realizedPnl.toFixed(4)),
      unrealizedPnl: Number(unrealizedPnl.toFixed(4)),
      totalPnl: Number((realizedPnl + unrealizedPnl).toFixed(4))
    };
  }

  snapshot(): PaperTraderState {
    return {
      openPositions: [...this.openPositions.entries()],
      closedTrades: this.closedTrades
    };
  }

  restore(state?: PaperTraderState): void {
    if (!state) return;
    this.openPositions = new Map(state.openPositions ?? []);
    this.closedTrades = state.closedTrades ?? [];
  }

  printSummary(): void {
    const summary = this.getSummary();
    const open = [...this.openPositions.values()];

    console.log("\n[PAPER] SUMMARY");
    console.log(JSON.stringify(summary, null, 2));

    if (open.length > 0) {
      console.log("[PAPER] OPEN POSITIONS");
      for (const p of open) {
        const pnl = this.calculatePnl(p, p.lastPrice);
        console.log(
          JSON.stringify(
            {
              whale: p.whale,
              tokenId: p.tokenId,
              title: p.title,
              outcome: p.outcome,
              side: p.side,
              entryPrice: p.entryPrice,
              lastPrice: p.lastPrice,
              pnlUsdc: Number(pnl.toFixed(4))
            },
            null,
            2
          )
        );
      }
    }
  }

  private calculatePnl(position: PaperPosition, currentPrice: number): number {
    if (position.side === "BUY") {
      return (currentPrice - position.entryPrice) * position.shares;
    }

    return (position.entryPrice - currentPrice) * position.shares;
  }
}