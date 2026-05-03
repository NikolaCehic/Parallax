import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis } from "../src/index.js";
import {
  createManagedTenant,
  initializeManagedSaas,
  recordObservabilityEvent,
  registerExternalIntegration,
  registerSecretReference
} from "../src/saas/managed.js";
import {
  dataVendorStatus,
  importDataVendorPack,
  registerDataVendorAdapter
} from "../src/saas/data_vendor.js";
import { startHostedServer } from "../src/saas/server.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-03T10:00:00Z";
const TOKEN = "phase-13-hosted-token";

type Candle = {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

function runCli(args: string[]) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PARALLAX_PYTHON: process.env.PARALLAX_PYTHON ?? "python3"
    }
  });
}

function isoDateFrom(base: string, offsetDays: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function makeCandles({ startDate = "2026-04-07", days = 26, basePrice = 100, drift = 0.005, volume = 5_000_000 } = {}) {
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
      volume: Math.round(volume * (1 + (index % 5) * 0.02))
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

async function createVendorSourceFixture({ license = "licensed_for_internal_research" } = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase13-vendor-"));
  for (const folder of ["market", "events", "fundamentals", "news", "actions", "portfolio"]) {
    await mkdir(path.join(dir, folder), { recursive: true });
  }
  await writeFile(path.join(dir, "market", "NVDA.csv"), toCsv(makeCandles({ volume: 9_000_000 })));
  await writeFile(path.join(dir, "events", "NVDA.json"), "[]\n");
  await writeFile(path.join(dir, "actions", "NVDA.json"), "[]\n");
  await writeFile(path.join(dir, "fundamentals", "NVDA.json"), `${JSON.stringify({
    as_of: "2026-04-30T00:00:00Z",
    period_end: "2026-03-31",
    revenue_growth_yoy: 0.24,
    eps_growth_yoy: 0.21,
    gross_margin: 0.73,
    net_debt_to_ebitda: 0.25,
    valuation: { forward_pe: 36 }
  }, null, 2)}\n`);
  await writeFile(path.join(dir, "news", "NVDA.json"), `${JSON.stringify([
    {
      published_at: "2026-05-02T15:00:00Z",
      source: "Phase13 Vendor Wire",
      source_reliability: 0.93,
      headline: "Vendor-sourced data center demand update",
      sentiment: 0.25,
      url: "https://vendor.example.invalid/nvda-demand"
    }
  ], null, 2)}\n`);
  await writeFile(path.join(dir, "portfolio", "default.json"), `${JSON.stringify({
    account_id: "phase13_vendor_portfolio",
    as_of: NOW,
    cash: 85000,
    total_equity: 100000,
    positions: [
      { symbol: "SMH", quantity: 15, market_value: 8000, sector: "semiconductors" }
    ],
    constraints: {
      max_single_name_pct: 0.12,
      max_sector_pct: 0.35,
      max_gross_exposure_pct: 1,
      paper_risk_budget_pct: 0.02
    },
    restricted_symbols: []
  }, null, 2)}\n`);
  await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify({
    provider: "phase13_vendor_replay",
    license,
    sources: {
      "market:NVDA": { source: "vendor-replay:market/NVDA.csv", license },
      "fundamentals:NVDA": { source: "vendor-replay:fundamentals/NVDA.json", license },
      "news:NVDA": { source: "vendor-replay:news/NVDA.json", license },
      "events:NVDA": { source: "vendor-replay:events/NVDA.json", license },
      "actions:NVDA": { source: "vendor-replay:actions/NVDA.json", license },
      "portfolio:default": { source: "vendor-replay:portfolio/default.json", license: "internal" }
    }
  }, null, 2)}\n`);
  return dir;
}

async function createManagedProviderFixture(rootDir: string, configPath = path.join(rootDir, "managed-saas.json")) {
  await initializeManagedSaas({
    rootDir,
    configPath,
    owner: "Phase Thirteen Platform",
    now: NOW
  });
  for (const tenant of [
    ["alpha", "Alpha Research"],
    ["beta", "Beta Research"]
  ]) {
    await createManagedTenant({
      rootDir,
      configPath,
      slug: tenant[0],
      name: tenant[1],
      owner: `${tenant[1]} Owner`,
      now: NOW
    });
  }
  for (const [name, scope, secretRef] of [
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase13/identity"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase13/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase13/llm"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase13/partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase13/observability"]
  ]) {
    await registerSecretReference({
      rootDir,
      configPath,
      name,
      scope,
      secretRef,
      now: NOW
    });
  }
  for (const integration of [
    {
      kind: "identity_provider",
      name: "OIDC Contract",
      provider: "enterprise_oidc",
      secretRef: "IDENTITY_PROVIDER",
      endpoint: "https://idp.example.invalid/oauth2",
      notes: "OIDC discovery document must be validated before production."
    },
    {
      kind: "market_data_vendor",
      name: "Licensed Market Data Contract",
      provider: "licensed_us_equities_vendor",
      tenantSlug: "alpha",
      secretRef: "MARKET_DATA_VENDOR",
      dataLicense: "licensed_for_internal_research",
      notes: "License and redistribution status must be approved before production."
    },
    {
      kind: "llm_provider",
      name: "Model Gateway Contract",
      provider: "model_gateway",
      secretRef: "LLM_PROVIDER",
      notes: "External model adapter must pass the council eval suite before production."
    },
    {
      kind: "regulated_partner",
      name: "Regulated Partner Contract",
      provider: "regulated_execution_partner",
      secretRef: "REGULATED_PARTNER",
      status: "disabled_until_legal_approval",
      notes: "Legal, market-access, and production-adapter approvals are not assumed."
    },
    {
      kind: "observability",
      name: "Managed Logs Contract",
      provider: "managed_logs_metrics",
      secretRef: "OBSERVABILITY_VENDOR",
      notes: "Production exporter must pass PII and retention checks."
    }
  ]) {
    await registerExternalIntegration({
      rootDir,
      configPath,
      status: "disabled_until_configured",
      validationStatus: "not_validated",
      now: NOW,
      ...integration
    });
  }
  await recordObservabilityEvent({
    rootDir,
    tenantSlug: "alpha",
    eventType: "data_vendor_fixture",
    severity: "info",
    message: "Phase 13 data vendor fixture.",
    metadata: { phase: 13 },
    now: NOW
  });
  return { rootDir, configPath };
}

async function apiJson(baseUrl: string, route: string, {
  method = "GET",
  token = TOKEN,
  tenant = "",
  body
}: {
  method?: string;
  token?: string;
  tenant?: string;
  body?: any;
} = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (tenant) headers["x-parallax-tenant"] = tenant;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {}
  };
}

function vendorPayload() {
  return {
    provider: "phase13_api_vendor_payload",
    license: "licensed_for_internal_research",
    market: makeCandles({ startDate: "2026-04-07", days: 26, basePrice: 120, drift: 0.004, volume: 7_000_000 }),
    events: [],
    actions: [],
    fundamentals: {
      as_of: "2026-04-30T00:00:00Z",
      revenue_growth_yoy: 0.2,
      eps_growth_yoy: 0.17,
      gross_margin: 0.71,
      net_debt_to_ebitda: 0.35,
      valuation: { forward_pe: 34 }
    },
    news: [
      {
        published_at: "2026-05-02T16:00:00Z",
        source: "Phase13 API Wire",
        source_reliability: 0.9,
        headline: "API vendor payload update",
        sentiment: 0.15
      }
    ]
  };
}

test("Phase 13 data vendor boundary imports licensed tenant data packs with provenance and strict license gates", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase13-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  const sourceDir = await createVendorSourceFixture();
  const restrictedDir = await createVendorSourceFixture({ license: "restricted" });
  try {
    await createManagedProviderFixture(rootDir, configPath);
    const adapter = await registerDataVendorAdapter({
      rootDir,
      configPath,
      adapterId: "licensed-local",
      name: "Licensed Local Vendor",
      provider: "licensed_us_equities_vendor",
      tenantSlug: "alpha",
      secretRef: "MARKET_DATA_VENDOR",
      endpoint: "https://data.example.invalid/replay",
      dataLicense: "licensed_for_internal_research",
      allowedSymbols: ["NVDA"],
      now: NOW
    });
    assert.equal(adapter.adapter.raw_secret_stored, false);
    assert.equal(adapter.adapter.direct_vendor_network_connection, false);

    const imported = await importDataVendorPack({
      rootDir,
      configPath,
      adapterId: "licensed-local",
      tenantSlug: "alpha",
      symbol: "NVDA",
      sourceDataDir: sourceDir,
      now: NOW
    });
    assert.equal(imported.data_status.passed, true);
    assert.equal(imported.import.data_dir.includes(path.join("tenants", "alpha", "data-vendors", "licensed-local", "NVDA")), true);
    assert.equal(imported.import.raw_secret_stored, false);
    assert.equal(imported.import.direct_vendor_network_connection, false);

    const status = await dataVendorStatus({ rootDir, configPath, now: NOW });
    assert.equal(status.status, "ready_for_external_data_vendor_boundary");
    assert.equal(status.summary.adapter_count, 1);
    assert.equal(status.summary.import_count, 1);
    assert.equal(status.summary.raw_secret_stored, false);

    await registerDataVendorAdapter({
      rootDir,
      configPath,
      adapterId: "licensed-beta",
      name: "Licensed Beta Vendor",
      provider: "licensed_us_equities_vendor",
      tenantSlug: "beta",
      secretRef: "MARKET_DATA_VENDOR",
      dataLicense: "licensed_for_internal_research",
      allowedSymbols: ["QQQ"],
      now: NOW
    });
    const tenantStatus = await dataVendorStatus({ rootDir, configPath, tenantSlug: "alpha", now: NOW });
    assert.equal(tenantStatus.summary.adapter_count, 1);
    assert.equal(tenantStatus.latest_events.every((event: any) => event.payload?.tenant_slug === "alpha"), true);

    const dossier = await analyzeThesis({
      symbol: "NVDA",
      horizon: "swing",
      thesis: "phase thirteen vendor-backed thesis",
      dataDir: imported.import.data_dir,
      actionCeiling: "paper_trade_candidate",
      now: NOW
    });
    assert.equal(dossier.evidence_snapshot.question.data_provider, "licensed_us_equities_vendor");
    assert.equal(dossier.evidence_snapshot.question.data_license, "internal");
    assert.ok(dossier.evidence_snapshot.items.every((item: any) => item.license !== "restricted"));

    await assert.rejects(() => importDataVendorPack({
      rootDir,
      configPath,
      adapterId: "licensed-local",
      tenantSlug: "alpha",
      symbol: "NVDA",
      sourceDataDir: restrictedDir,
      now: NOW
    }), /license is not allowed/);

    await assert.rejects(() => importDataVendorPack({
      rootDir,
      configPath,
      adapterId: "licensed-local",
      tenantSlug: "alpha",
      symbol: "TSLA",
      sourceDataDir: sourceDir,
      now: NOW
    }), /not approved/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
    await rm(restrictedDir, { recursive: true, force: true });
  }
});

test("Phase 13 CLI and hosted API expose tenant-scoped data vendor import without unsafe data_dir escape", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase13-cli-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  const sourceDir = await createVendorSourceFixture();
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    await createManagedProviderFixture(rootDir, configPath);

    const registered = runCli([
      "data-vendor-register",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--adapter", "licensed-local",
      "--name", "Licensed Local Vendor",
      "--provider", "licensed_us_equities_vendor",
      "--secret-ref", "MARKET_DATA_VENDOR",
      "--data-license", "licensed_for_internal_research",
      "--allowed-symbols", "NVDA",
      "--now", NOW
    ]);
    assert.match(registered, /Parallax Data Vendor Adapter/);

    const imported = JSON.parse(runCli([
      "data-vendor-import",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--adapter", "licensed-local",
      "--symbol", "NVDA",
      "--source-dir", sourceDir,
      "--json",
      "--now", NOW
    ]));
    assert.equal(imported.import.data_status_passed, true);

    const statusText = runCli([
      "data-vendor-status",
      "--root-dir", rootDir,
      "--now", NOW
    ]);
    assert.match(statusText, /ready_for_external_data_vendor_boundary/);
    assert.match(statusText, /Direct vendor network connection: no/);

    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0
    });

    const apiImport = await apiJson(started.url, "/api/tenants/alpha/data-vendor", {
      method: "POST",
      tenant: "alpha",
      body: {
        adapter_id: "licensed-local",
        symbol: "NVDA",
        payload: vendorPayload(),
        now: NOW
      }
    });
    assert.equal(apiImport.status, 201);
    assert.equal(apiImport.body.import.data_status_passed, true);
    assert.equal(apiImport.body.import.data_dir.includes(path.join("tenants", "alpha", "data-vendors")), true);

    const apiStatus = await apiJson(started.url, "/api/data-vendors/status");
    assert.equal(apiStatus.status, 200);
    assert.equal(apiStatus.body.status, "ready_for_external_data_vendor_boundary");

    const analyzed = await apiJson(started.url, "/api/tenants/alpha/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        symbol: "NVDA",
        horizon: "swing",
        thesis: "hosted analysis uses tenant-scoped vendor data",
        data_dir: apiImport.body.import.data_dir,
        now: NOW
      }
    });
    assert.equal(analyzed.status, 201);
    assert.equal(analyzed.body.tenant_slug, "alpha");

    const escapedDataDir = await apiJson(started.url, "/api/tenants/alpha/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        symbol: "NVDA",
        thesis: "unsafe external data dir should be blocked",
        data_dir: sourceDir,
        now: NOW
      }
    });
    assert.equal(escapedDataDir.status, 403);
    assert.equal(escapedDataDir.body.error, "forbidden");

    const restrictedApi = await apiJson(started.url, "/api/tenants/alpha/data-vendor", {
      method: "POST",
      tenant: "alpha",
      body: {
        adapter_id: "licensed-local",
        symbol: "NVDA",
        payload: {
          ...vendorPayload(),
          license: "restricted"
        },
        now: NOW
      }
    });
    assert.equal(restrictedApi.status, 400);
    assert.equal(restrictedApi.body.error, "bad_request");
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
    await rm(sourceDir, { recursive: true, force: true });
  }
});
