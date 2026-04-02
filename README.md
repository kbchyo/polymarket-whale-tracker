# Polymarket Whale Tracker (Hybrid, Paper Trading)
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

## Results Summary (Paper Simulation)

| Variant | Signals Passed | Open / Closed Trades | Total PnL (Paper) | Median Lag | P90 Lag |
|---|---:|---:|---:|---:|---:|
| Hybrid-20 | 2193 | 1036 / 1157 | +15.8767 | 19.905s | 33.559s |
| Hybrid-30 | 1876 | 864 / 1012 | -22.4449 | 20.050s | 32.945s |

> Notes:
> - Metrics above come from prior full simulation windows (pre-reset snapshots).
> - Results are paper-mode only and depend on market regime and simulation assumptions.
> - Hybrid-30 was evaluated under bankroll-constrained settings.

## Tech Stack

- Python 3.10+
- Pandas / NumPy
- Requests
- JSON/CSV data pipelines
  
## Quick Start
```text
git clone https://github.com/kbchyo/polymarket-whale-tracker.git
cd polymarket-whale-tracker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python src/main.py
```
## Repository Structure
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
