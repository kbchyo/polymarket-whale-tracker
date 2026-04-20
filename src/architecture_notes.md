# Whale Copy Bot Architecture Notes

## Why paper trades were not opening

Root causes identified and fixed:

1. **Timestamp normalization bug**
   - Data API timestamps can be numeric epoch seconds.
   - `isRecentTrade()` expected date-like strings/ms and treated seconds as 1970 timestamps.
   - Result: trades were marked stale and filtered out.

2. **Field mapping mismatch from Data API**
   - `user` sometimes arrives as `proxyWallet`.
   - `tokenId` can arrive as `asset`.
   - Missing tokenId/user prevented `PaperTrader.onSignal()` from opening positions.

3. **Node 22 start script incompatibility**
   - `node --loader tsx` fails on newer Node.
   - Changed to `tsx src/index.ts`.

## Current event flow

- `polymarket.ts` fetches and normalizes trade rows into `WhaleTrade`.
- `filters.ts` applies copy filters.
- `index.ts` dedupes events and emits copy signals.
- `paperTrader.ts` opens/closes virtual positions and tracks PnL.

## Recommended real-time architecture (websocket-first)

1. **Feed Layer**
   - `TradeFeed` interface (`start/stop/on`) in `feed.ts`.
   - `PollingWhaleFeed` as fallback.
   - `WebSocketTradeFeed` as primary low-latency feed (`websocketFeed.ts`).

2. **Normalization Layer**
   - Channel-specific parser converts websocket payloads -> canonical `WhaleTrade`.
   - Keep this isolated from strategy logic.

3. **Decision Layer**
   - `shouldCopyDecision()` returns explicit reasons (`too_small`, `stale`, `non_crypto`).
   - Enables observability and tuning.

4. **Execution Layer**
   - Paper trader for simulation.
   - Later: live executor module using CLOB API.

5. **State/Storage Layer**
   - Persist dedupe keys + open positions to disk/DB.
   - Optional: append-only signal log for post-mortems and whale scoring.

## Migration path to websocket

Phase 1:
- Run polling + websocket in parallel in shadow mode.
- Compare event parity and latency.

Phase 2:
- Primary websocket, polling as health fallback.
- Auto-failover to polling on websocket disconnect.

Phase 3:
- Remove high-frequency polling once websocket is stable.

## Next technical step

Create a Polymarket-channel-specific extractor function for `WebSocketTradeFeed` and wire it into `index.ts` behind an env flag:
- `FEED_MODE=poll|ws`
- `POLYMARKET_WS_URL=...`
