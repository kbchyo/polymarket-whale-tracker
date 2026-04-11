#!/bin/zsh
set -euo pipefail

cd /Users/andrew/poly-copy-bot

# Side paper-sim instance for alternate whale.
export WHALE_ADDRESSES="0x751a2b86cab503496efd325c8344e10159349ea1"
export LIVE_TRADING="false"
export FEED_MODE="poll"
export POLL_MS="3000"
export STATE_FILE=".state/bot-state.side-whale.json"

# Keep risk limits conservative for side test.
export PAPER_TRADE_SIZE_USDC="25"
export MAX_OPEN_POSITIONS="0"
export MAX_DAILY_LOSS_USDC="50"
export MAX_DAILY_STAKE_USDC="0"
export MAX_LOSS_PER_POSITION_USDC="20"
export TOP_N_WEIGHTED_POSITIONS="8"

export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
exec /opt/homebrew/opt/node@22/bin/node /Users/andrew/poly-copy-bot/node_modules/tsx/dist/cli.mjs src/index.ts
