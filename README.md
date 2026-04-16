# Polymarket Whale Tracker (Hybrid, Paper Trading)

A TypeScript/Python bot that tracks high-volume wallet activity ("whales") on Polymarket and simulates copy-trading decisions in paper mode (no real money).

Built as a portfolio piece emphasizing real-time data engineering, signal pipeline design, and reproducible performance analysis.

---

## Features

- **Hybrid signal pipeline**, WebSocket-triggered detection for low latency + reconciliation polling to catch missed events
- **Paper-trading engine** with full position tracking (no live order execution)
- **Multiple feed modes**: `poll`, `ws`, `hybrid`, `shadow` (for latency benchmarking)
- **Risk controls**: stop-loss, take-profit, stale-trade closing, position caps, daily loss/stake limits, flip suppression, per-position loss limits
- **Signal deduplication**: ID-based and semantic deduplication to prevent double-counting
- **Bankroll-constrained simulation** for capital-aware strategy comparison
- **Persistent state** across runs via JSON state file
- **Performance instrumentation**: p90 latency tracking, signal pass/skip/reject metrics, source attribution (ws vs poll)
- **Top-N weighted position filtering**, focus on whale's highest-conviction tokens

---

## Results Summary (Paper Simulation)

| Variant | Signals Passed | Open / Closed Trades | Total PnL (Paper) | Median Lag | P90 Lag |
|---|---:|---:|---:|---:|---:|
| Hybrid-20 | 2193 | 1036 / 1157 | +15.8767 | 19.905s | 33.559s |
| Hybrid-30 | 1876 | 864 / 1012 | -22.4449 | 20.050s | 32.945s |

> Results are paper-mode only. Metrics come from full simulation windows (pre-reset snapshots) and depend on market regime and simulation assumptions.

Dashboard screenshots are in [`screenshots/`](./screenshots/).

---

## Architecture

```
src/
├── index.ts              # Main entry point — orchestrates feed, signal processing, risk engine
├── config.ts             # All configuration via environment variables
├── feed.ts               # PollingWhaleFeed, WebsocketTriggeredWhaleFeed, HybridWhaleFeed
├── websocketFeed.ts      # WebSocket connection and reconnect logic
├── polymarketWsParser.ts # Parses Polymarket WebSocket message format
├── polymarket.ts         # Polymarket REST API client
├── paperTrader.ts        # Paper trading engine — positions, PnL, mark-to-market
├── filters.ts            # Trade signal filtering logic
├── types.ts              # Shared TypeScript types
├── gapReport.ts          # Gap detection and reconciliation reporting
├── checkLive.ts          # Live trading preflight checks
└── ARCHITECTURE_NOTES.md # Design decisions and notes

scripts/
├── run_hybrid_whale_sim.sh      # Hybrid-20 simulation runner for comparison
├── run_hybrid_whale_sim_30.sh   # Hybrid-30 (bankroll-constrained of 30 USD) runner
├── run_tuned_whale_sim.sh       # Tuned variant runner
├── run_side_whale_sim.sh        # Side-only variant runner
├── hour_paper_run.py            # Hourly paper run utility
├── log_pnl_snapshot.py          # PnL snapshot logger
└── track_hybrid30_equity.py     # Hybrid-30 equity tracker
```

---

## Quick Start

```bash
git clone https://github.com/kbchyo/polymarket-whale-tracker.git
cd polymarket-whale-tracker
npm install

# Configure environment
cp .env.example .env
# Edit .env with your settings

npm start
```

---

## Configuration

All configuration is via environment variables (see `.env.example`):

| Variable | Description | Default |
|---|---|---|
| `WHALE_ADDRESSES` | Comma-separated whale wallet addresses to track | required |
| `FEED_MODE` | `poll`, `ws`, `hybrid`, or `shadow` | `poll` |
| `PAPER_TRADE_SIZE_USDC` | Paper trade size in USDC | `25` |
| `STARTING_BANKROLL_USDC` | Starting bankroll for constrained mode | `0` (disabled) |
| `LIVE_TRADING` | Enable live trading | `false` |
| `STOP_LOSS_PCT` | Stop-loss threshold % | `0` (disabled) |
| `TAKE_PROFIT_PCT` | Take-profit threshold % | `0` (disabled) |
| `MAX_OPEN_POSITIONS` | Max concurrent open positions | `12` |
| `MAX_DAILY_LOSS_USDC` | Daily loss circuit breaker | `50` |
| `POLL_MS` | Polling interval in ms | `500` |
| `POLYMARKET_WS_URL` | WebSocket URL (required for ws/hybrid mode) | — |

---

## Tech Stack

- TypeScript / Node.js
- `@polymarket/clob-client` — Polymarket CLOB API
- `ethers` — wallet/on-chain support
- `dotenv` — environment configuration
- Python utility scripts for simulation analysis
