A Python-based analytics project that tracks high-volume wallet activity ("whales") on Polymarket and simulates copy-trading decisions in paper mode (no real money).

This project is designed as a portfolio piece, emphasizing:
- data collection and transformation
- signal filtering and risk controls
- reproducible analysis outputs

## Features

- Whale trade/activity ingestion
- Crypto-market filtering
- Paper-trading simulation (no live order submission)
- Risk controls (position limits, stop-loss/take-profit, cooldowns)
- Performance tracking (PnL, latency, signal pass rate)
- Exportable logs for analysis

## Core Features

- Whale activity/trade ingestion from Polymarket data sources
- Hybrid signal pipeline (websocket-triggered + reconciliation flow)
- Paper-trading engine (no live order execution)
- Risk controls:
- stop-loss / take-profit
- position caps
- market cap constraints
- stale-trade filtering
- Latency tracking:
- median and p90 signal lag
- Bankroll tracking mode:

## Tech Stack

- Python 3.10+
- Pandas / NumPy
- Requests
- JSON/CSV data pipelines

## Comparison Snapshot (Baseline vs Hybrid)

**Latest recorded snapshot (2026-03-31):**

| Model | Signals Passed | Open / Closed | Total PnL (Paper) | Median Lag | P90 Lag |
|---|---:|---:|---:|---:|---:|
| Baseline (main snapshot) | 28 | 25 / 0 | -85.9332 | 25.973s | 47.184s |
| Hybrid-20 (primary) | 2193 | 1036 / 1157 | +15.8767 | 19.905s | 33.559s |
| Hybrid-30 (bankroll-mode) | 1876 | 864 / 1012 | -22.4449 | 20.050s | 32.945s |

### Key Takeaway
The hybrid approach improved signal latency substantially versus baseline and scaled to much higher signal volume. Performance varied by risk configuration and bankroll constraints, which is why multiple simulation modes were tracked.


```text
polymarket-whale-tracker/
├── src/
│ └── main.py
├── data/
│ └── sample_trades.csv
├── screenshots/
├── README.md
├── requirements.txt
└── .gitignore
