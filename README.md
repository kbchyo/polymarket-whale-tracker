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

Quick Start

shell

git clone https://github.com/<your-username>/polymarket-whale-tracker.git
cd polymarket-whale-tracker
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python src/main.py
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
