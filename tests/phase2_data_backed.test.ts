import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis, writeAuditBundle } from "../src/index.js";
import { buildDataStatus } from "../src/data/status.js";
import { writePortfolioJson } from "../src/data/portfolio.js";
import { sourceViewFromAudit } from "../src/library/store.js";
import { writeDashboard } from "../src/app/dashboard.js";

const NOW = "2026-05-01T14:30:00Z";

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function isoDateFrom(base: string, offsetDays: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function makeCandles({ startDate = "2026-04-05", days = 26, basePrice = 100, drift = 0.006, volume = 4_000_000 } = {}) {
  let close = basePrice;
  const candles: Candle[] = [];
  for (let index = 0; index < days; index += 1) {
    const open = close;
    close = Math.max(1, close * (1 + drift));
    candles.push({
      date: isoDateFrom(startDate, index),
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) * 1.01).toFixed(2)),
      low: Number((Math.min(open, close) * 0.99).toFixed(2)),
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

async function writeDataBackedFixture({ restrictedLicense = false, staleFundamentals = false } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase2-"));
  for (const folder of ["market", "events", "fundamentals", "news", "actions", "portfolio"]) {
    await mkdir(path.join(dir, folder), { recursive: true });
  }

  await writeFile(path.join(dir, "market", "NVDA.csv"), toCsv(makeCandles({ volume: 8_000_000 })));
  await writeFile(path.join(dir, "market", "SMH.csv"), toCsv(makeCandles({ basePrice: 180, drift: 0.003, volume: 6_000_000 })));
  await writeFile(path.join(dir, "market", "QQQ.csv"), toCsv(makeCandles({ basePrice: 250, drift: 0.002, volume: 10_000_000 })));
  await writeFile(path.join(dir, "events", "NVDA.json"), "[]\n");
  await writeFile(path.join(dir, "actions", "NVDA.json"), `${JSON.stringify([
    {
      type: "split",
      effective_date: "2026-04-10T13:30:00Z",
      ratio: 2,
      description: "Synthetic two-for-one split for adjustment proof"
    }
  ], null, 2)}\n`);
  await writeFile(path.join(dir, "fundamentals", "NVDA.json"), `${JSON.stringify({
    as_of: staleFundamentals ? "2025-08-01T00:00:00Z" : "2026-04-20T00:00:00Z",
    period_end: staleFundamentals ? "2025-07-31" : "2026-03-31",
    revenue_growth_yoy: 0.22,
    eps_growth_yoy: 0.19,
    gross_margin: 0.72,
    net_debt_to_ebitda: 0.3,
    valuation: { forward_pe: 38 }
  }, null, 2)}\n`);
  await writeFile(path.join(dir, "news", "NVDA.json"), `${JSON.stringify([
    {
      published_at: "2026-04-30T15:00:00Z",
      source: "Phase2 Research Wire",
      source_reliability: 0.92,
      headline: "Data center demand update",
      sentiment: 0.2,
      url: "https://example.test/nvda-demand"
    }
  ], null, 2)}\n`);
  await writeFile(path.join(dir, "portfolio", "broker.csv"), [
    "symbol,quantity,market_value,sector",
    "SMH,20,9000,semiconductors",
    "QQQ,10,5000,broad"
  ].join("\n") + "\n");
  await writePortfolioJson({
    csvPath: path.join(dir, "portfolio", "broker.csv"),
    out: path.join(dir, "portfolio", "default.json"),
    accountId: "phase2_broker_export",
    cash: 86000,
    totalEquity: 100000
  });
  await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify({
    provider: "phase2_local_licensed_pack",
    license: restrictedLicense ? "restricted" : "internal",
    sources: {
      "market:NVDA": { source: "licensed-local:market/NVDA.csv" },
      "fundamentals:NVDA": { source: "licensed-local:fundamentals/NVDA.json" },
      "news:NVDA": { source: "licensed-local:news/NVDA.json" },
      "actions:NVDA": { source: "licensed-local:actions/NVDA.json" },
      "portfolio:default": { source: "broker-export:portfolio/default.json" }
    }
  }, null, 2)}\n`);

  return dir;
}

function tool(dossier: any, toolName: string) {
  return dossier.tool_outputs.find((output: any) => output.tool_name === toolName);
}

test("Phase 2 E2E creates a data-backed dossier with provenance, fundamentals, news, corporate actions, and dashboard freshness", async () => {
  const dataDir = await writeDataBackedFixture();
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase2-audit-"));
  try {
    const status = await buildDataStatus({ dataDir, symbol: "NVDA", now: NOW });
    assert.equal(status.passed, true);
    assert.equal(status.by_kind.fundamental, 1);
    assert.equal(status.by_kind.news, 1);
    assert.equal(status.by_kind.corporate_action, 1);
    assert.equal(status.by_license.internal, status.item_count);

    const dossier = await analyzeThesis({
      symbol: "NVDA",
      horizon: "swing",
      thesis: "phase two data-backed thesis",
      dataDir,
      actionCeiling: "paper_trade_candidate",
      now: NOW
    });
    assert.equal(tool(dossier, "fundamentals_check").status, "passed");
    assert.equal(tool(dossier, "news_provenance_check").status, "passed");
    assert.equal(tool(dossier, "corporate_action_check").result.price_adjustment_applied, true);
    assert.equal(dossier.evidence_snapshot.question.data_provider, "phase2_local_licensed_pack");

    const auditPath = await writeAuditBundle(dossier, { auditDir });
    const sources = await sourceViewFromAudit(auditPath);
    assert.equal(sources.data_provider, "phase2_local_licensed_pack");
    assert.equal(sources.freshness_summary.by_kind.fundamental, 1);
    assert.ok(sources.sources.some((source: any) => source.payload_summary.rows || source.payload_summary.keys));

    const dashboard = await writeDashboard({
      auditDir,
      out: path.join(auditDir, "phase2-dashboard.html"),
      now: "2026-05-01T15:00:00Z"
    });
    const html = await readFile(dashboard.out, "utf8");
    assert.match(html, /Data Freshness/);
    assert.match(html, /licensed-local:fundamentals\/NVDA\.json/);
  } finally {
    await rm(dataDir, { recursive: true, force: true });
    await rm(auditDir, { recursive: true, force: true });
  }
});

test("Phase 2 E2E visibly blocks restricted or stale licensed data", async () => {
  const dataDir = await writeDataBackedFixture({ restrictedLicense: true, staleFundamentals: true });
  try {
    const status = await buildDataStatus({ dataDir, symbol: "NVDA", now: NOW });
    assert.equal(status.passed, false);
    assert.ok(status.restricted_items.length > 0);
    assert.ok(status.stale_items.length > 0);

    const dossier = await analyzeThesis({
      symbol: "NVDA",
      horizon: "swing",
      thesis: "phase two restricted data should block",
      dataDir,
      actionCeiling: "paper_trade_candidate",
      now: NOW
    });
    assert.equal(dossier.action_class, "no_trade");
    assert.equal(dossier.lifecycle.state, "invalidated");
    assert.ok(dossier.decision_packet.vetoes.some((veto: any) => String(veto.reason).includes("Data quality")));
  } finally {
    await rm(dataDir, { recursive: true, force: true });
  }
});
