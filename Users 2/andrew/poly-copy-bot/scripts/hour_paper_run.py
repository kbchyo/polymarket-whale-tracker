#!/usr/bin/env python3
import json
import re
import subprocess
import time
from pathlib import Path

ROOT = Path('/Users/andrew/poly-copy-bot')
LOG = ROOT / 'paper_hour_run.log'


def parse_results(text: str):
    opens = len(re.findall(r"\[PAPER\] OPEN", text))
    closes = len(re.findall(r"\[PAPER\] CLOSE", text))

    summary_blocks = re.findall(r"\[PAPER\] SUMMARY\n(\{[\s\S]*?\})", text)
    latest_summary = None
    if summary_blocks:
        try:
            latest_summary = json.loads(summary_blocks[-1])
        except Exception:
            latest_summary = None

    metric_lines = re.findall(r"\[METRICS\].*", text)
    latest_metrics = metric_lines[-1] if metric_lines else None

    return {
        "opens": opens,
        "closes": closes,
        "latest_summary": latest_summary,
        "latest_metrics": latest_metrics,
    }


def main():
    if LOG.exists():
        LOG.unlink()

    cmd = ["npm", "run", "start"]
    with open(LOG, "w", encoding="utf-8") as f:
        proc = subprocess.Popen(cmd, cwd=str(ROOT), stdout=f, stderr=subprocess.STDOUT, text=True)
        start = time.time()
        duration = 3600

        while time.time() - start < duration:
            if proc.poll() is not None:
                break
            time.sleep(2)

        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=10)
            except subprocess.TimeoutExpired:
                proc.kill()

    text = LOG.read_text(encoding="utf-8", errors="ignore") if LOG.exists() else ""
    results = parse_results(text)
    results["runtime_seconds"] = round(min(time.time() - start, 3600), 1)
    results["log_file"] = str(LOG)

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
