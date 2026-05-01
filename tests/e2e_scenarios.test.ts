import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis, evaluateLifecycle, writeAuditBundle, readAuditBundle, replayAuditBundle } from "../src/index.js";
import { createPaperTicket, simulatePaperFill, closePaperTrade, attributePaperOutcome } from "../src/paper/trading.js";
import { ApprovalStore, KillSwitch, preTradeControls, SandboxBroker } from "../src/execution/sandbox.js";
import { validateGovernedRelease, calibrationReport } from "../src/governance/registry.js";

const NOW = "2026-05-01T14:30:00Z";

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type ScenarioOptions = {
  symbol?: string;
  basePrice?: number;
  drift?: number;
  shockEvery?: number;
  shockMagnitude?: number;
  volume?: number;
  endDate?: string;
  positions?: any[];
  restrictedSymbols?: string[];
  events?: any[];
  maxSingleNamePct?: number;
  maxSectorPct?: number;
  dependencies?: string[];
};

function isoDateFrom(base: string, offsetDays: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function makeCandles({
  startDate = "2026-03-26",
  days = 26,
  basePrice = 100,
  drift = 0.006,
  shockEvery = 0,
  shockMagnitude = 0,
  volume = 4_000_000
} = {}): Candle[] {
  let close = basePrice;
  const candles: Candle[] = [];
  for (let index = 0; index < days; index += 1) {
    const shock = shockEvery > 0 && index > 0 && index % shockEvery === 0
      ? (index % (shockEvery * 2) === 0 ? shockMagnitude : -shockMagnitude)
      : 0;
    const move = drift + shock;
    const open = close;
    close = Math.max(1, close * (1 + move));
    const range = Math.max(0.004, Math.abs(move) * 1.8 + 0.004);
    candles.push({
      date: isoDateFrom(startDate, index),
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) * (1 + range / 2)).toFixed(2)),
      low: Number((Math.min(open, close) * (1 - range / 2)).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(volume * (1 + (index % 5) * 0.03))
    });
  }
  return candles;
}

function toCsv(candles: Candle[]) {
  return [
    "date,open,high,low,close,volume",
    ...candles.map((candle) => [
      candle.date,
      candle.open,
      candle.high,
      candle.low,
      candle.close,
      candle.volume
    ].join(","))
  ].join("\n") + "\n";
}

async function writeScenario({
  symbol = "ARB",
  basePrice = 100,
  drift = 0.006,
  shockEvery = 0,
  shockMagnitude = 0,
  volume = 4_000_000,
  endDate = "2026-04-30",
  positions = [],
  restrictedSymbols = [],
  events = [],
  maxSingleNamePct = 0.12,
  maxSectorPct = 0.35,
  dependencies = ["BENCH", "SECTOR"]
}: ScenarioOptions = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "parallax-e2e-"));
  await mkdir(path.join(dir, "market"), { recursive: true });
  await mkdir(path.join(dir, "events"), { recursive: true });
  await mkdir(path.join(dir, "portfolio"), { recursive: true });

  const startDate = isoDateFrom(endDate, -25);
  const primary = makeCandles({ startDate, basePrice, drift, shockEvery, shockMagnitude, volume });
  const bench = makeCandles({ startDate, basePrice: 250, drift: drift * 0.35, volume: volume * 1.5 });
  const sector = makeCandles({ startDate, basePrice: 180, drift: drift * 0.65, shockEvery, shockMagnitude: shockMagnitude * 0.35, volume: volume });

  await writeFile(path.join(dir, "market", `${symbol}.csv`), toCsv(primary));
  await writeFile(path.join(dir, "market", "BENCH.csv"), toCsv(bench));
  await writeFile(path.join(dir, "market", "SECTOR.csv"), toCsv(sector));
  await writeFile(path.join(dir, "events", `${symbol}.json`), `${JSON.stringify(events, null, 2)}\n`);
  await writeFile(path.join(dir, "portfolio", "default.json"), `${JSON.stringify({
    account_id: "e2e_fixture",
    cash: 100000,
    total_equity: 100000,
    positions,
    constraints: {
      max_single_name_pct: maxSingleNamePct,
      max_sector_pct: maxSectorPct,
      max_gross_exposure_pct: 1,
      paper_risk_budget_pct: 0.02
    },
    restricted_symbols: restrictedSymbols
  }, null, 2)}\n`);

  return {
    dir,
    symbol,
    dependencies,
    latestClose: primary.at(-1)!.close
  };
}

async function cleanup(dir: string) {
  await rm(dir, { recursive: true, force: true });
}

async function analyzeScenario(options: ScenarioOptions & { thesis?: string; horizon?: string; ceiling?: string; now?: string } = {}) {
  const scenario = await writeScenario(options);
  const dossier = await analyzeThesis({
    symbol: scenario.symbol,
    horizon: options.horizon ?? "swing",
    thesis: options.thesis ?? "synthetic e2e thesis",
    dataDir: scenario.dir,
    actionCeiling: options.ceiling ?? "watchlist",
    now: options.now ?? NOW
  });
  return { scenario, dossier };
}

function tool(dossier: any, toolName: string) {
  return dossier.tool_outputs.find((output: any) => output.tool_name === toolName);
}

test("E2E clean liquid momentum scenario reaches paper gate and survives replay/governance", async () => {
  const { scenario, dossier } = await analyzeScenario({
    drift: 0.007,
    volume: 8_000_000,
    ceiling: "paper_trade_candidate",
    positions: [{ symbol: "BENCH", market_value: 8000, sector: "broad" }]
  });

  try {
    assert.equal(dossier.action_class, "paper_trade_candidate");
    assert.equal(dossier.lifecycle.state, "active");
    assert.equal(dossier.decision_packet.vetoes.length, 0);
    assert.equal(tool(dossier, "data_quality_check").status, "passed");
    assert.equal(validateGovernedRelease({ dossier }).passed, true);

    const auditPath = path.join(scenario.dir, "audit.json");
    await writeAuditBundle(dossier, { auditDir: scenario.dir });
    const bundlePath = path.join(scenario.dir, `${dossier.id}.json`);
    const replay = replayAuditBundle(await readAuditBundle(bundlePath));
    assert.equal(replay.valid, true);
    assert.ok(auditPath || bundlePath);
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E stale market data hard-vetoes escalation", async () => {
  const { scenario, dossier } = await analyzeScenario({
    endDate: "2026-03-15",
    now: NOW,
    ceiling: "paper_trade_candidate"
  });

  try {
    assert.equal(dossier.action_class, "no_trade");
    assert.equal(dossier.lifecycle.state, "invalidated");
    assert.equal(dossier.decision_packet.confidence, 0);
    assert.ok(dossier.decision_packet.vetoes.some((veto: any) => String(veto.reason).includes("Data quality")));
    assert.throws(() => createPaperTicket(dossier), /invalidated thesis|below paper-trade threshold/);
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E restricted symbol hard-vetoes through compliance", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "LOCK",
    restrictedSymbols: ["LOCK"],
    ceiling: "paper_trade_candidate"
  });

  try {
    assert.equal(dossier.action_class, "no_trade");
    assert.equal(dossier.lifecycle.state, "invalidated");
    assert.ok(dossier.decision_packet.vetoes.some((veto: any) => veto.persona_id === "compliance_conflicts_officer"));
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E concentration breach hard-vetoes through portfolio risk", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "HEAVY",
    positions: [
      { symbol: "HEAVY", market_value: 20_000, sector: "semiconductors" },
      { symbol: "SECTOR", market_value: 22_000, sector: "semiconductors" }
    ],
    ceiling: "paper_trade_candidate"
  });

  try {
    assert.equal(dossier.action_class, "no_trade");
    assert.equal(tool(dossier, "portfolio_exposure_check").status, "warning");
    assert.ok(dossier.decision_packet.vetoes.some((veto: any) => veto.persona_id === "portfolio_risk_manager"));
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E violent volatility creates dissent and blocks paper promotion without hard veto", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "WILD",
    shockEvery: 3,
    shockMagnitude: 0.12,
    drift: 0.001,
    ceiling: "paper_trade_candidate"
  });

  try {
    assert.notEqual(dossier.action_class, "paper_trade_candidate");
    assert.equal(dossier.decision_packet.vetoes.length, 0);
    assert.ok(dossier.summary.dissent.includes("regime_cartographer"));
    assert.ok(dossier.summary.dissent.includes("portfolio_risk_manager"));
    assert.equal(tool(dossier, "volatility_check").result.high_volatility, true);
    assert.equal(dossier.decision_packet.confidence_cap_reason, "unresolved_dissent");
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E future material events shorten expiry and add event escalation trigger", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "EVENT",
    events: [{
      date: "2026-05-03T13:30:00Z",
      type: "earnings",
      materiality: "high",
      description: "Synthetic high-materiality future event"
    }]
  });

  try {
    assert.equal(tool(dossier, "event_calendar_check").status, "warning");
    assert.ok(dossier.lifecycle.triggers.some((trigger: any) => trigger.kind === "escalate" && trigger.condition_type === "event"));
    assert.equal(dossier.lifecycle.expires_at, "2026-05-02T02:30:00.000Z");
    const updated = evaluateLifecycle(dossier.lifecycle, {
      now: "2026-05-01T15:00:00Z",
      last_price: scenario.latestClose,
      annualized_volatility_20: 0.2,
      material_event_arrives: true
    });
    assert.equal(updated.state, "stale");
    assert.ok(updated.fired_triggers.some((trigger: any) => trigger.kind === "escalate"));
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E past material events do not create future event risk", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "PAST",
    events: [{
      date: "2026-04-01T13:30:00Z",
      type: "earnings",
      materiality: "high",
      description: "Synthetic high-materiality past event"
    }]
  });

  try {
    assert.equal(tool(dossier, "event_calendar_check").status, "passed");
    assert.equal(tool(dossier, "event_calendar_check").result.material_event_count, 0);
    assert.equal(dossier.lifecycle.triggers.some((trigger: any) => trigger.condition_type === "event"), false);
    assert.equal(dossier.lifecycle.expires_at, "2026-05-02T14:30:00.000Z");
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E lifecycle trigger matrix invalidates, rechecks, and expires as intended", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "TRIG",
    drift: 0.005
  });

  try {
    const invalidate = dossier.lifecycle.triggers.find((trigger: any) => trigger.kind === "invalidate");
    const recheck = dossier.lifecycle.triggers.find((trigger: any) => trigger.kind === "recheck");
    const lower = Number(invalidate.condition.split("<")[1].trim());
    const upper = Number(recheck.condition.split(">")[1].trim());

    const invalidated = evaluateLifecycle(dossier.lifecycle, {
      now: "2026-05-01T15:00:00Z",
      last_price: lower - 0.01,
      annualized_volatility_20: 0.2
    });
    assert.equal(invalidated.state, "invalidated");

    const staleRecheck = evaluateLifecycle(dossier.lifecycle, {
      now: "2026-05-01T15:00:00Z",
      last_price: upper + 0.01,
      annualized_volatility_20: 0.2
    });
    assert.equal(staleRecheck.state, "stale");

    const expired = evaluateLifecycle(dossier.lifecycle, {
      now: "2026-05-03T15:00:00Z",
      last_price: scenario.latestClose,
      annualized_volatility_20: 0.2
    });
    assert.equal(expired.state, "stale");
    assert.ok(expired.freshness_score <= 0.3);
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E paper trade path records fill, close, attribution, and calibration", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "PAPER",
    drift: 0.006,
    ceiling: "paper_trade_candidate"
  });

  try {
    const ticket = createPaperTicket(dossier);
    const filled = simulatePaperFill(ticket, { marketPrice: scenario.latestClose + 0.2, now: "2026-05-01T15:00:00Z" });
    const closed = closePaperTrade(filled, { exitPrice: filled.fill_price + 2, now: "2026-05-02T15:00:00Z" });
    const attribution = attributePaperOutcome(dossier, closed);
    const report = calibrationReport([dossier], [closed]);

    assert.equal(ticket.status, "created");
    assert.equal(filled.status, "filled");
    assert.equal(closed.status, "closed");
    assert.equal(attribution.sizing_quality, "within_budget");
    assert.equal(report.paper_outcome_count, 1);
    assert.equal(report.profitable_paper_rate, 1);
  } finally {
    await cleanup(scenario.dir);
  }
});

test("E2E sandbox execution cannot bypass approval, expiry, kill switch, or risk controls", async () => {
  const { scenario, dossier } = await analyzeScenario({
    symbol: "EXEC",
    drift: 0.006,
    ceiling: "paper_trade_candidate"
  });

  try {
    const ticket = createPaperTicket(dossier);
    const approvals = new ApprovalStore();
    const killSwitch = new KillSwitch();
    const broker = new SandboxBroker({ approvalStore: approvals, killSwitch });

    assert.throws(() => broker.submit({ dossier, ticket, now: "2026-05-01T15:00:00Z" }), /no approval/);

    approvals.approve(ticket, { approver: "e2e-human", now: "2026-05-01T14:31:00Z", expiresAt: "2026-05-01T14:32:00Z" });
    assert.throws(() => broker.submit({ dossier, ticket, now: "2026-05-01T14:40:00Z" }), /expired/);

    approvals.approve(ticket, { approver: "e2e-human", now: "2026-05-01T14:41:00Z", expiresAt: "2026-05-01T15:10:00Z" });
    killSwitch.activate("e2e");
    assert.throws(() => broker.submit({ dossier, ticket, now: "2026-05-01T14:42:00Z" }), /Kill switch active/);
    killSwitch.deactivate();

    const tooLarge = { ...ticket, notional: 20_000 };
    const controls = preTradeControls({ dossier, ticket: tooLarge, now: "2026-05-01T14:43:00Z" });
    assert.equal(controls.passed, false);
    assert.ok(controls.problems.some((problem: string) => problem.includes("single-name")));

    const submitted = broker.submit({ dossier, ticket, now: "2026-05-01T14:44:00Z" });
    assert.equal(submitted.status, "submitted_to_sandbox");
  } finally {
    await cleanup(scenario.dir);
  }
});
