#!/usr/bin/env python3
import json
from pathlib import Path
from datetime import datetime, timezone, timedelta

ROOT = Path('/Users/andrew/poly-copy-bot')
STATE = ROOT / '.state/bot-state.hybrid-whale-30.json'
OUT_JSON = ROOT / '.state/hybrid30_equity.json'
OUT_SERIES = ROOT / '.state/hybrid30_equity_timeseries.jsonl'
OUT_SVG = Path('/Users/andrew/.openclaw/workspace/hybrid30_bankroll_dashboard.svg')
STARTING_BANKROLL = 30.0


def compute_equity(state: dict) -> dict:
    pt = state.get('paperTrader', {})
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

    total_pnl = realized + unreal
    equity_now = STARTING_BANKROLL + total_pnl

    return {
        'ts': datetime.now(timezone.utc).isoformat(),
        'startingBankroll': STARTING_BANKROLL,
        'realizedPnl': round(realized, 6),
        'unrealizedPnl': round(unreal, 6),
        'totalPnl': round(total_pnl, 6),
        'equityNow': round(equity_now, 6),
        'openPositions': len(open_positions),
        'closedTrades': len(closed),
        'openedStakeUsdcToday': state.get('riskState', {}).get('openedStakeUsdc', 0),
        'signalsPassed': state.get('metrics', {}).get('signalsPassed', 0)
    }


def render_svg(rows: list[dict]) -> None:
    if not rows:
        return

    parsed = []
    for r in rows:
        try:
            dt = datetime.fromisoformat(r['ts'].replace('Z', '+00:00'))
            parsed.append((dt, float(r['equityNow'])))
        except Exception:
            continue
    if not parsed:
        return

    # Full available history window
    if len(parsed) < 2:
        parsed = parsed[-2:] if len(parsed) >= 2 else parsed

    W, H = 1280, 760
    ml, mr, mt, mb = 95, 55, 80, 120
    cw, ch = W - ml - mr, H - mt - mb

    x0, x1 = parsed[0][0], parsed[-1][0]
    if x0 == x1:
        x1 = x0 + timedelta(minutes=1)

    def x_of(dt: datetime) -> float:
        span = (x1 - x0).total_seconds()
        return ml + ((dt - x0).total_seconds() / span) * cw

    vals = [v for _, v in parsed] + [STARTING_BANKROLL]
    ymin, ymax = min(vals), max(vals)
    pad = max(1.0, (ymax - ymin) * 0.18 if ymax != ymin else 1.0)
    ymin -= pad
    ymax += pad

    def y_of(v: float) -> float:
        return mt + (1 - (v - ymin) / (ymax - ymin)) * ch

    line = ' '.join(
        ('M' if i == 0 else 'L') + f"{x_of(t):.1f},{y_of(v):.1f}"
        for i, (t, v) in enumerate(parsed)
    )

    latest_t, latest_v = parsed[-1]

    svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}">',
        '<rect width="100%" height="100%" fill="#0b1020"/>',
        f'<text x="{W/2}" y="40" text-anchor="middle" fill="#e5e7eb" font-size="32" font-family="Arial">Hybrid-30 Live Bankroll (Full History)</text>',
        f'<line x1="{ml}" y1="{mt}" x2="{ml}" y2="{mt+ch}" stroke="#94a3b8"/>',
        f'<line x1="{ml}" y1="{mt+ch}" x2="{ml+cw}" y2="{mt+ch}" stroke="#94a3b8"/>',
        f'<line x1="{ml}" y1="{y_of(STARTING_BANKROLL):.1f}" x2="{ml+cw}" y2="{y_of(STARTING_BANKROLL):.1f}" stroke="#64748b" stroke-dasharray="6,4"/>',
    ]

    for i in range(7):
        y = mt + i * ch / 6
        val = ymax - (i * (ymax - ymin) / 6)
        svg.append(f'<line x1="{ml}" y1="{y:.1f}" x2="{ml+cw}" y2="{y:.1f}" stroke="#1f2937"/>')
        svg.append(f'<text x="{ml-12}" y="{y+5:.1f}" text-anchor="end" fill="#94a3b8" font-size="13" font-family="Arial">{val:.2f}</text>')

    svg.append(f'<path d="{line}" fill="none" stroke="#22c55e" stroke-width="4"/>')
    svg.append(f'<circle cx="{x_of(latest_t):.1f}" cy="{y_of(latest_v):.1f}" r="5" fill="#22c55e"/>')

    for h in range(7):
        t = x0 + timedelta(seconds=((x1 - x0).total_seconds()) * h / 6)
        x = x_of(t)
        svg.append(f'<line x1="{x:.1f}" y1="{mt+ch}" x2="{x:.1f}" y2="{mt+ch+6}" stroke="#94a3b8"/>')
        svg.append(f'<text x="{x:.1f}" y="{mt+ch+24}" text-anchor="middle" fill="#94a3b8" font-size="13" font-family="Arial">{t.strftime("%H:%M")}</text>')

    svg.append(f'<text x="{ml}" y="{H-58}" fill="#22c55e" font-size="14" font-family="Arial">Latest bankroll: ${latest_v:.2f} (start ${STARTING_BANKROLL:.2f})</text>')
    svg.append(f'<text x="{ml}" y="{H-36}" fill="#cbd5e1" font-size="13" font-family="Arial">Last updated (UTC): {datetime.now(timezone.utc).isoformat()}</text>')
    svg.append(f'<text x="{W/2}" y="{H-14}" text-anchor="middle" fill="#94a3b8" font-size="14" font-family="Arial">Time (UTC)</text>')
    svg.append('</svg>')

    OUT_SVG.parent.mkdir(parents=True, exist_ok=True)
    OUT_SVG.write_text('\n'.join(svg), encoding='utf-8')


def main() -> None:
    if not STATE.exists():
        return

    state = json.loads(STATE.read_text())
    row = compute_equity(state)

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(row, indent=2), encoding='utf-8')

    with open(OUT_SERIES, 'a', encoding='utf-8') as f:
        f.write(json.dumps(row) + '\n')

    rows = []
    if OUT_SERIES.exists():
        for line in OUT_SERIES.read_text(encoding='utf-8').splitlines():
            if not line.strip():
                continue
            try:
                rows.append(json.loads(line))
            except Exception:
                continue
    render_svg(rows)


if __name__ == '__main__':
    main()
