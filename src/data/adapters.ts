import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseCsv, rowsToCandles } from "../evidence/csv.js";

export const DEFAULT_DEPENDENCIES: Record<string, string[]> = {
  NVDA: ["SMH", "QQQ"],
  AAPL: ["QQQ", "XLK"],
  TSLA: ["QQQ"]
};

export async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readCsvIfExists(filePath: string) {
  try {
    return parseCsv(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

export function freshnessForAsOf(asOf: string, nowIso: string, maxAgeDays = 7) {
  const ageMs = new Date(nowIso).getTime() - new Date(asOf).getTime();
  if (ageMs < 0) return "unknown";
  if (ageMs <= 1000 * 60 * 60 * 24 * maxAgeDays) return "fresh";
  return "stale";
}

function latestDate(items: any[], field = "date") {
  const dates = items
    .map((item) => item[field])
    .filter(Boolean)
    .map((value) => new Date(String(value)).getTime())
    .filter((value) => !Number.isNaN(value));
  if (!dates.length) return undefined;
  return new Date(Math.max(...dates)).toISOString();
}

export async function loadDataManifest(dataDir: string) {
  return readJsonIfExists(path.join(dataDir, "manifest.json"), {
    provider: "local_files",
    license: "internal",
    sources: {}
  });
}

function sourceMeta(manifest: any, key: string, fallback: any) {
  return {
    provider: manifest.provider ?? "local_files",
    license: manifest.license ?? "internal",
    ...fallback,
    ...(manifest.sources?.[key] ?? {})
  };
}

export function applyCorporateActions(candles: any[], actions: any[]) {
  const splits = actions.filter((action) => action.type === "split" && Number(action.ratio) > 0);
  if (!splits.length) return { candles, adjustments: [] };

  const adjustments: any[] = [];
  const adjusted = candles.map((candle) => {
    let priceFactor = 1;
    let volumeFactor = 1;
    for (const split of splits) {
      if (new Date(candle.date).getTime() < new Date(split.effective_date ?? split.date).getTime()) {
        const ratio = Number(split.ratio);
        priceFactor *= ratio;
        volumeFactor *= ratio;
      }
    }
    if (priceFactor === 1 && volumeFactor === 1) return candle;
    adjustments.push({ date: candle.date, price_factor: priceFactor, volume_factor: volumeFactor });
    return {
      ...candle,
      open: Number((candle.open / priceFactor).toFixed(4)),
      high: Number((candle.high / priceFactor).toFixed(4)),
      low: Number((candle.low / priceFactor).toFixed(4)),
      close: Number((candle.close / priceFactor).toFixed(4)),
      volume: Math.round(candle.volume * volumeFactor)
    };
  });

  return { candles: adjusted, adjustments };
}

export async function loadCorporateActions({
  dataDir,
  symbol,
  now,
  manifest = undefined
}: {
  dataDir: string;
  symbol: string;
  now: string;
  manifest?: any;
}) {
  const activeManifest = manifest ?? await loadDataManifest(dataDir);
  const filePath = path.join(dataDir, "actions", `${symbol}.json`);
  const payload = await readJsonIfExists(filePath, []);
  const asOf = latestDate(payload, "effective_date") ?? latestDate(payload, "date") ?? now;
  const meta = sourceMeta(activeManifest, `actions:${symbol}`, {
    source: `local:actions/${symbol}.json`,
    license: activeManifest.license ?? "internal"
  });
  return {
    kind: "corporate_action",
    source: meta.source,
    symbol,
    asOf,
    freshnessStatus: freshnessForAsOf(asOf, now, 365),
    license: meta.license,
    payload
  };
}

export async function loadMarketData({
  dataDir,
  symbol,
  now,
  corporateActions = [],
  manifest = undefined
}: {
  dataDir: string;
  symbol: string;
  now: string;
  corporateActions?: any[];
  manifest?: any;
}) {
  const activeManifest = manifest ?? await loadDataManifest(dataDir);
  const filePath = path.join(dataDir, "market", `${symbol}.csv`);
  const rows = parseCsv(await readFile(filePath, "utf8"));
  const rawCandles = rowsToCandles(rows);
  const adjusted = applyCorporateActions(rawCandles, corporateActions);
  const latest = adjusted.candles.at(-1);
  const asOf = `${latest.date}T20:00:00Z`;
  const meta = sourceMeta(activeManifest, `market:${symbol}`, {
    source: `local:market/${symbol}.csv`,
    license: activeManifest.license ?? "internal"
  });
  return {
    kind: "price",
    source: meta.source,
    symbol,
    asOf,
    freshnessStatus: freshnessForAsOf(asOf, now, 7),
    license: meta.license,
    payload: adjusted.candles,
    metadata: {
      adjusted_for_corporate_actions: adjusted.adjustments.length > 0,
      adjustment_count: adjusted.adjustments.length
    }
  };
}

export async function loadFundamentals({
  dataDir,
  symbol,
  now,
  manifest = undefined
}: {
  dataDir: string;
  symbol: string;
  now: string;
  manifest?: any;
}) {
  const activeManifest = manifest ?? await loadDataManifest(dataDir);
  const payload = await readJsonIfExists(path.join(dataDir, "fundamentals", `${symbol}.json`), undefined);
  if (!payload) return undefined;
  const asOf = payload.as_of ?? payload.period_end ?? now;
  const meta = sourceMeta(activeManifest, `fundamentals:${symbol}`, {
    source: `local:fundamentals/${symbol}.json`,
    license: activeManifest.license ?? "internal"
  });
  return {
    kind: "fundamental",
    source: meta.source,
    symbol,
    asOf,
    freshnessStatus: freshnessForAsOf(asOf, now, 120),
    license: meta.license,
    payload
  };
}

export async function loadNews({
  dataDir,
  symbol,
  now,
  manifest = undefined
}: {
  dataDir: string;
  symbol: string;
  now: string;
  manifest?: any;
}) {
  const activeManifest = manifest ?? await loadDataManifest(dataDir);
  const payload = await readJsonIfExists(path.join(dataDir, "news", `${symbol}.json`), undefined);
  if (!payload) return undefined;
  const items = Array.isArray(payload) ? payload : payload.items ?? [];
  const asOf = latestDate(items, "published_at") ?? latestDate(items, "date") ?? now;
  const meta = sourceMeta(activeManifest, `news:${symbol}`, {
    source: `local:news/${symbol}.json`,
    license: activeManifest.license ?? "internal"
  });
  return {
    kind: "news",
    source: meta.source,
    symbol,
    asOf,
    freshnessStatus: freshnessForAsOf(asOf, now, 14),
    license: meta.license,
    payload: items
  };
}

export async function loadEvents({
  dataDir,
  symbol,
  now,
  manifest = undefined
}: {
  dataDir: string;
  symbol: string;
  now: string;
  manifest?: any;
}) {
  const activeManifest = manifest ?? await loadDataManifest(dataDir);
  const payload = await readJsonIfExists(path.join(dataDir, "events", `${symbol}.json`), []);
  const asOf = latestDate(payload, "date") ?? now;
  const meta = sourceMeta(activeManifest, `events:${symbol}`, {
    source: `local:events/${symbol}.json`,
    license: activeManifest.license ?? "internal"
  });
  return {
    kind: "event",
    source: meta.source,
    symbol,
    asOf,
    freshnessStatus: "fresh",
    license: meta.license,
    payload
  };
}

export async function loadPortfolio({
  dataDir,
  now,
  manifest = undefined
}: {
  dataDir: string;
  now: string;
  manifest?: any;
}) {
  const activeManifest = manifest ?? await loadDataManifest(dataDir);
  const jsonPayload = await readJsonIfExists(path.join(dataDir, "portfolio", "default.json"), undefined);
  if (jsonPayload) {
    const meta = sourceMeta(activeManifest, "portfolio:default", {
      source: "local:portfolio/default.json",
      license: activeManifest.license ?? "internal"
    });
    return {
      kind: "portfolio",
      source: meta.source,
      symbol: "PORTFOLIO",
      asOf: jsonPayload.as_of ?? now,
      freshnessStatus: "fresh",
      license: meta.license,
      payload: jsonPayload
    };
  }

  const rows = await readCsvIfExists(path.join(dataDir, "portfolio", "default.csv"));
  if (rows) {
    const positions = rows.map((row: any) => ({
      symbol: row.symbol,
      quantity: Number(row.quantity ?? 0),
      market_value: Number(row.market_value ?? row.value ?? 0),
      sector: row.sector ?? "unknown"
    }));
    const totalEquity = rows.reduce((sum: number, row: any) => sum + Number(row.market_value ?? row.value ?? 0), 0);
    const payload = {
      account_id: "csv_import",
      cash: 0,
      total_equity: totalEquity || 100000,
      positions,
      constraints: {
        max_single_name_pct: 0.12,
        max_sector_pct: 0.35,
        max_gross_exposure_pct: 1,
        paper_risk_budget_pct: 0.02
      },
      restricted_symbols: []
    };
    return {
      kind: "portfolio",
      source: "local:portfolio/default.csv",
      symbol: "PORTFOLIO",
      asOf: now,
      freshnessStatus: "fresh",
      license: activeManifest.license ?? "internal",
      payload
    };
  }

  return {
    kind: "portfolio",
    source: "default:empty_portfolio",
    symbol: "PORTFOLIO",
    asOf: now,
    freshnessStatus: "fresh",
    license: "internal",
    payload: {
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
    }
  };
}
