#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path('/Users/andrew/poly-copy-bot')
STATE = ROOT / '.state/bot-state.json'
OUT = ROOT / '.state/pnl_timeseries.jsonl'


def main():
    if not STATE.exists():
        return
    s = json.loads(STATE.read_text())
    pt = s.get('paperTrader', {})
    open_positions = pt.get('openPositions', [])
    closed = pt.get('closedTrades', [])

    realized = sum((t.get('pnlUsdc') or 0) for t in closed)
    unreal = 0.0
    for _, pos in open_positions:
        e = float(pos.get('entryPrice') or 0)
        l = float(pos.get('lastPrice') or e)
        sh = float(pos.get('shares') or 0)
        side = pos.get('side')
        unreal += (l - e) * sh if side == 'BUY' else (e - l) * sh

    row = {
        'ts': datetime.now(timezone.utc).isoformat(),
        'realizedPnl': round(realized, 6),
        'unrealizedPnl': round(unreal, 6),
        'totalPnl': round(realized + unreal, 6),
        'openPositions': len(open_positions),
        'closedTrades': len(closed),
        'openedStakeUsdcToday': s.get('riskState', {}).get('openedStakeUsdc', 0),
        'liveTrading': bool((ROOT / '.env').read_text().lower().find('live_trading=true') != -1)
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT, 'a', encoding='utf-8') as f:
        f.write(json.dumps(row) + '\n')


if __name__ == '__main__':
    main()
