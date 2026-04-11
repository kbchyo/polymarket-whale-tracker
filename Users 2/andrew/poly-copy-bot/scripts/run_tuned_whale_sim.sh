#!/bin/zsh
set -euo pipefail

cd /Users/andrew/poly-copy-bot

# Tuned side paper-sim instance for primary whale.
export WHALE_ADDRESSES="0x63ce342161250d705dc0b16df89036c8e5f9ba9a"
export LIVE_TRADING="false"
export FEED_MODE="poll"
export POLL_MS="3000"
export STATE_FILE=".state/bot-state.tuned-whale.json"

# Tuned profile (supported by current codebase)
export PAPER_TRADE_SIZE_USDC="20"
export SIGNAL_COOLDOWN_MS="10000"
export MAX_OPEN_POSITIONS="0"
export MAX_DAILY_LOSS_USDC="50"
export MAX_DAILY_STAKE_USDC="0"
export MAX_LOSS_PER_POSITION_USDC="12"
export TOP_N_WEIGHTED_POSITIONS="12"

exec /opt/homebrew/opt/node@22/bin/node /Users/andrew/poly-copy-bot/node_modules/tsx/dist/cli.mjs src/index.ts
