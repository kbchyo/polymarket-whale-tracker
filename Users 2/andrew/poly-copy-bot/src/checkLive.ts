import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";

type Check = { name: string; pass: boolean; details: string };

function loadState(): any | null {
  const statePath = path.resolve(config.stateFile);
  if (!fs.existsSync(statePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf-8"));
  } catch {
    return null;
  }
}

function main() {
  const checks: Check[] = [];
  const state = loadState();

  checks.push({
    name: "Feed mode configured",
    pass: ["poll", "ws", "shadow"].includes(config.feedMode),
    details: `feedMode=${config.feedMode}`
  });

  checks.push({
    name: "WS endpoint present (for ws/shadow)",
    pass: config.feedMode === "poll" || Boolean(config.wsUrl),
    details: config.wsUrl || "(empty)"
  });

  checks.push({
    name: "Signal cooldown enabled",
    pass: config.signalCooldownMs >= 1000,
    details: `SIGNAL_COOLDOWN_MS=${config.signalCooldownMs}`
  });

  checks.push({
    name: "Open position cap enabled",
    pass: config.maxOpenPositions > 0,
    details: `MAX_OPEN_POSITIONS=${config.maxOpenPositions}`
  });

  checks.push({
    name: "Daily loss cap enabled",
    pass: config.maxDailyLossUsdc > 0,
    details: `MAX_DAILY_LOSS_USDC=${config.maxDailyLossUsdc}`
  });

  checks.push({
    name: "Daily stake cap enabled",
    pass: config.maxDailyStakeUsdc > 0,
    details: `MAX_DAILY_STAKE_USDC=${config.maxDailyStakeUsdc}`
  });

  checks.push({
    name: "Per-position loss cap enabled",
    pass: config.maxLossPerPositionUsdc > 0,
    details: `MAX_LOSS_PER_POSITION_USDC=${config.maxLossPerPositionUsdc}`
  });

  checks.push({
    name: "Top-N weighted filter valid",
    pass: config.topNWeightedPositions >= 0,
    details: `TOP_N_WEIGHTED_POSITIONS=${config.topNWeightedPositions}`
  });

  checks.push({
    name: "State file path configured",
    pass: Boolean(config.stateFile),
    details: `STATE_FILE=${config.stateFile}`
  });

  checks.push({
    name: "State file exists",
    pass: state != null,
    details: state ? "present" : "missing (run bot first to create)"
  });

  const today = new Date().toISOString().slice(0, 10);
  const stateDay = state?.riskState?.day;
  checks.push({
    name: "Risk state day initialized",
    pass: !state || Boolean(stateDay),
    details: stateDay ? `riskState.day=${stateDay}` : "state unavailable"
  });

  checks.push({
    name: "Recent metrics available",
    pass: !state || typeof state?.metrics?.tradesIn === "number",
    details: state?.metrics ? `tradesIn=${state.metrics.tradesIn}` : "state unavailable"
  });

  const passed = checks.filter((c) => c.pass).length;

  console.log("\n=== LIVE READINESS CHECKLIST ===");
  for (const c of checks) {
    console.log(`${c.pass ? "✅" : "❌"} ${c.name} :: ${c.details}`);
  }
  console.log("--------------------------------");
  console.log(`Score: ${passed}/${checks.length}`);
  console.log(`Today: ${today}`);

  if (passed === checks.length) {
    console.log("Result: PASS (ready for small live pilot)");
    process.exit(0);
  }

  console.log("Result: NOT READY (fix failed checks first)");
  process.exit(1);
}

main();
