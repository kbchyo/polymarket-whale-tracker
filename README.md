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

## Tech Stack

- Python 3.10+
- Pandas / NumPy
- Requests
- JSON/CSV data pipelines

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
