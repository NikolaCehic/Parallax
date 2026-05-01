import { readFile } from "node:fs/promises";
import path from "node:path";
import { makeId, stableHash, isoNow } from "../core/ids.js";
import { parseCsv, rowsToCandles } from "./csv.js";

const DEFAULT_DEPENDENCIES = {
  NVDA: ["SMH", "QQQ"],
  AAPL: ["QQQ", "XLK"],
  TSLA: ["QQQ"]
};

async function readJsonIfExists(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readCandles(dataDir, symbol) {
  const filePath = path.join(dataDir, "market", `${symbol}.csv`);
  const rows = parseCsv(await readFile(filePath, "utf8"));
  return rowsToCandles(rows);
}

function evidenceItem({ kind, source, symbol, asOf, retrievedAt, freshnessStatus, license = "internal", payload }) {
  const payloadHash = stableHash(payload);
  const item = {
    id: makeId("ev", { kind, source, symbol, asOf, payloadHash }),
    kind,
    source,
    symbol,
    as_of: asOf,
    retrieved_at: retrievedAt,
    freshness_status: freshnessStatus,
    license,
    payload_ref: `inline:${payloadHash}`,
    hash: payloadHash,
    payload
  };
  return item;
}

function freshnessForAsOf(asOf, nowIso) {
  const ageMs = new Date(nowIso).getTime() - new Date(asOf).getTime();
  if (ageMs < 0) return "unknown";
  if (ageMs <= 1000 * 60 * 60 * 24 * 7) return "fresh";
  return "stale";
}

export async function buildEvidenceSnapshot({
  symbol,
  horizon = "swing",
  thesis,
  dataDir = "fixtures",
  now = isoNow(),
  dependencies = DEFAULT_DEPENDENCIES[symbol] ?? []
}) {
  const candles = await readCandles(dataDir, symbol);
  const latest = candles.at(-1);
  const items = [
    evidenceItem({
      kind: "price",
      source: `fixture:${symbol}.csv`,
      symbol,
      asOf: `${latest.date}T20:00:00Z`,
      retrievedAt: now,
      freshnessStatus: freshnessForAsOf(`${latest.date}T20:00:00Z`, now),
      payload: candles
    })
  ];

  for (const dependency of dependencies) {
    try {
      const depCandles = await readCandles(dataDir, dependency);
      const depLatest = depCandles.at(-1);
      items.push(evidenceItem({
        kind: "price",
        source: `fixture:${dependency}.csv`,
        symbol: dependency,
        asOf: `${depLatest.date}T20:00:00Z`,
        retrievedAt: now,
        freshnessStatus: freshnessForAsOf(`${depLatest.date}T20:00:00Z`, now),
        payload: depCandles
      }));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  const portfolio = await readJsonIfExists(path.join(dataDir, "portfolio", "default.json"), {
    account_id: "fixture",
    cash: 100000,
    positions: [],
    constraints: {
      max_single_name_pct: 0.12,
      max_sector_pct: 0.35,
      max_gross_exposure_pct: 1.0,
      paper_risk_budget_pct: 0.02
    },
    restricted_symbols: []
  });

  items.push(evidenceItem({
    kind: "portfolio",
    source: "fixture:portfolio/default.json",
    symbol: "PORTFOLIO",
    asOf: now,
    retrievedAt: now,
    freshnessStatus: "fresh",
    payload: portfolio
  }));

  const events = await readJsonIfExists(path.join(dataDir, "events", `${symbol}.json`), []);
  items.push(evidenceItem({
    kind: "event",
    source: `fixture:events/${symbol}.json`,
    symbol,
    asOf: now,
    retrievedAt: now,
    freshnessStatus: "fresh",
    payload: events
  }));

  const question = {
    symbol,
    horizon,
    thesis,
    requested_action: "analyze",
    dependencies
  };

  const snapshot = {
    id: makeId("snap", { question, items: items.map((item) => item.hash), now }),
    created_at: now,
    question,
    items,
    hash: stableHash({ question, items: items.map((item) => item.hash) })
  };

  return snapshot;
}

export function getEvidence(snapshot, kind, symbol) {
  return snapshot.items.find((item) => item.kind === kind && (symbol === undefined || item.symbol === symbol));
}
