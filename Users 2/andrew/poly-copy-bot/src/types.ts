export type WhaleTrade = {
  id: string;
  user?: string;
  side?: string;
  price?: number;
  size?: number;
  usdcSize?: number;
  outcome?: string;
  title?: string;
  market?: string;
  slug?: string;
  eventSlug?: string;
  conditionId?: string;
  tokenId?: string;
  timestamp?: string;
  raw: unknown;
};

export type MarketInfo = {
  slug: string;
  question: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  tags: string[];
};

export type PositionSide = "BUY" | "SELL";

export type PaperPosition = {
  tokenId: string;
  whale: string;
  marketSlug?: string;
  title?: string;
  outcome?: string;
  side: PositionSide;
  entryPrice: number;
  entryTime: string;
  stakeUsdc: number;
  shares: number;
  open: boolean;
  lastPrice: number;

  // Source-link instrumentation for exact lifecycle gap analysis
  sourceWhaleTradeId?: string;
  sourceWhaleTradeTs?: string;
  sourceWhalePrice?: number;
  sourceSignalObservedTs?: string;
};

export type ClosedPaperTrade = {
  tokenId: string;
  whale: string;
  marketSlug?: string;
  title?: string;
  outcome?: string;
  entrySide: PositionSide;
  exitSide: PositionSide;
  entryPrice: number;
  exitPrice: number;
  entryTime: string;
  exitTime: string;
  stakeUsdc: number;
  shares: number;
  pnlUsdc: number;
  pnlPct: number;

  // Source-link instrumentation
  sourceWhaleTradeId?: string;
  sourceWhaleTradeTs?: string;
  sourceWhalePrice?: number;
  sourceSignalObservedTs?: string;
};