#!/bin/zsh
set -euo pipefail

cd /Users/andrew/poly-copy-bot

# Second hybrid paper-sim instance with $30 per-trade baseline.
export WHALE_ADDRESSES="0x63ce342161250d705dc0b16df89036c8e5f9ba9a"
export LIVE_TRADING="false"
export FEED_MODE="hybrid"
export POLL_MS="2000"
export STATE_FILE=".state/bot-state.hybrid-whale-30.json"

export PAPER_TRADE_SIZE_USDC="10"
export MIN_USDC_SIZE="20"
export SIGNAL_COOLDOWN_MS="1000"
export MAX_TRADE_AGE_MS="180000"
export COPY_ONLY_WHALE_BUYS="false"
export MARKET_POSITION_CAP_USDC="10"
export MAX_OPEN_POSITIONS="0"
export MAX_DAILY_LOSS_USDC="30"
export MAX_DAILY_STAKE_USDC="0"
export MAX_LOSS_PER_POSITION_USDC="10"
export STARTING_BANKROLL_USDC="50"
export TOP_N_WEIGHTED_POSITIONS="0"
export MIN_WHALE_NOTIONAL_USDC="10"
export FLIP_SUPPRESS_MS="10000"
export STOP_LOSS_PCT="8"
export TAKE_PROFIT_PCT="12"
export STALE_CLOSE_MS="900000"

export WHALE_TRADE_FETCH_LIMIT="5"
export WS_TRIGGER_COOLDOWN_MS="180"

exec /opt/homebrew/opt/node@22/bin/node /Users/andrew/poly-copy-bot/node_modules/tsx/dist/cli.mjs src/index.ts
