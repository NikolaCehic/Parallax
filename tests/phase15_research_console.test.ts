import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildHostedConsoleHtml, writeHostedConsole } from "../src/app/hosted_console.js";
import {
  createManagedTenant,
  initializeManagedSaas,
  recordObservabilityEvent,
  registerExternalIntegration,
  registerSecretReference
} from "../src/saas/managed.js";
import {
  initializeIdentityDirectory,
  issueIdentitySession,
  registerIdentityPrincipal
} from "../src/saas/identity.js";
import {
  createStorageCheckpoint,
  initializeDurableStorage,
  writeDurableObject
} from "../src/saas/storage.js";
import {
  importDataVendorPack,
  registerDataVendorAdapter
} from "../src/saas/data_vendor.js";
import {
  registerLLMProviderAdapter,
  runLLMProviderReplayAnalysis
} from "../src/saas/llm_provider.js";
import {
  hostedApiTokenHash,
  startHostedServer
} from "../src/saas/server.js";

const NOW = "2026-05-03T10:00:00Z";
const TOKEN = "phase-15-hosted-token";
const PHASE15_PERSONAS = [
  "quant_researcher",
  "data_quality_officer",
  "model_validator",
  "red_team_skeptic"
];

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

async function createVendorSourceFixture() {
  const dir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase15-vendor-"));
  for (const folder of ["market", "events", "actions", "portfolio"]) {
    await mkdir(path.join(dir, folder), { recursive: true });
  }
  await writeFile(path.join(dir, "market", "NVDA.csv"), toCsv(makeCandles({ volume: 9_000_000 })));
  await writeFile(path.join(dir, "events", "NVDA.json"), "[]\n");
  await writeFile(path.join(dir, "actions", "NVDA.json"), "[]\n");
  await writeFile(path.join(dir, "portfolio", "default.json"), `${JSON.stringify({
    account_id: "phase15_console_portfolio",
    as_of: NOW,
    cash: 85000,
    total_equity: 100000,
    positions: [],
    constraints: {
      max_single_name_pct: 0.12,
      max_sector_pct: 0.35,
      max_gross_exposure_pct: 1,
      paper_risk_budget_pct: 0.02
    },
    restricted_symbols: []
  }, null, 2)}\n`);
  await writeFile(path.join(dir, "manifest.json"), `${JSON.stringify({
    provider: "phase15_vendor_replay",
    license: "licensed_for_internal_research",
    sources: {
      "market:NVDA": { source: "vendor-replay:market/NVDA.csv", license: "licensed_for_internal_research" },
      "events:NVDA": { source: "vendor-replay:events/NVDA.json", license: "licensed_for_internal_research" },
      "actions:NVDA": { source: "vendor-replay:actions/NVDA.json", license: "licensed_for_internal_research" },
      "portfolio:default": { source: "vendor-replay:portfolio/default.json", license: "internal" }
    }
  }, null, 2)}\n`);
  return dir;
}

async function createManagedConsoleFixture(rootDir: string, configPath = path.join(rootDir, "managed-saas.json")) {
  await initializeManagedSaas({
    rootDir,
    configPath,
    owner: "Phase Fifteen Platform",
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
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase15/identity"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase15/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase15/llm"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase15/partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase15/observability"]
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
    eventType: "research_console_fixture",
    severity: "info",
    message: "Phase 15 research console fixture.",
    metadata: { phase: 15 },
    now: NOW
  });
  await initializeIdentityDirectory({ rootDir, now: NOW });
  await registerIdentityPrincipal({
    rootDir,
    configPath,
    email: "analyst@example.com",
    name: "Phase Fifteen Analyst",
    tenantSlug: "alpha",
    role: "tenant_admin",
    now: NOW
  });
  const session = await issueIdentitySession({
    rootDir,
    email: "analyst@example.com",
    tenantSlug: "alpha",
    now: NOW
  });
  await initializeDurableStorage({ rootDir, configPath, now: NOW });
  await writeDurableObject({
    rootDir,
    configPath,
    tenantSlug: "alpha",
    key: "console.seed",
    value: { symbols: ["NVDA"], mode: "research" },
    now: NOW
  });
  await createStorageCheckpoint({
    rootDir,
    configPath,
    tenantSlug: "alpha",
    label: "phase15-console",
    now: NOW
  });
  const sourceDir = await createVendorSourceFixture();
  await registerDataVendorAdapter({
    rootDir,
    configPath,
    adapterId: "licensed-local",
    name: "Licensed Local Vendor",
    provider: "licensed_us_equities_vendor",
    tenantSlug: "alpha",
    secretRef: "MARKET_DATA_VENDOR",
    dataLicense: "licensed_for_internal_research",
    allowedSymbols: ["NVDA"],
    now: NOW
  });
  await importDataVendorPack({
    rootDir,
    configPath,
    adapterId: "licensed-local",
    tenantSlug: "alpha",
    symbol: "NVDA",
    sourceDataDir: sourceDir,
    now: NOW
  });
  await registerLLMProviderAdapter({
    rootDir,
    configPath,
    adapterId: "model-gateway-replay",
    name: "Model Gateway Replay",
    provider: "model_gateway",
    tenantSlug: "alpha",
    secretRef: "LLM_PROVIDER",
    modelRegistryRef: "model_gateway_replay_v0",
    allowedPersonas: PHASE15_PERSONAS,
    now: NOW
  });
  await runLLMProviderReplayAnalysis({
    rootDir,
    configPath,
    adapterId: "model-gateway-replay",
    tenantSlug: "alpha",
    symbol: "NVDA",
    thesis: "phase fifteen console replay thesis",
    dataDir: "fixtures",
    actionCeiling: "watchlist",
    audit: true,
    now: NOW
  });
  return { rootDir, configPath, sourceDir, sessionToken: session.session_token };
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

test("Phase 15 hosted research console renders onboarding, analysis workspace, readiness rails, and redacted boundaries", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase15-"));
  let sourceDir = "";
  try {
    const fixture = await createManagedConsoleFixture(rootDir);
    sourceDir = fixture.sourceDir;
    const html = await buildHostedConsoleHtml({
      rootDir,
      configPath: fixture.configPath,
      apiTokenHash: hostedApiTokenHash(TOKEN),
      now: NOW
    });
    assert.match(html, /Parallax Hosted Console/);
    assert.match(html, /Research readiness and tenant analysis workspace/);
    assert.match(html, /Readiness Checklist/);
    assert.match(html, /Run Analysis/);
    assert.match(html, /Boundary Status/);
    assert.match(html, /Tenant Library/);
    assert.match(html, /ready_for_external_data_vendor_boundary/);
    assert.match(html, /ready_for_external_llm_provider_boundary/);
    assert.match(html, /ready_for_identity_storage_foundation/);
    assert.match(html, /sessionStorage/);
    assert.match(html, /\/api\/tenants\//);
    assert.equal(html.includes("secret://"), false);
    assert.equal(html.includes(TOKEN), false);

    const out = path.join(rootDir, "research-console.html");
    const written = await writeHostedConsole({
      rootDir,
      configPath: fixture.configPath,
      out,
      apiTokenHash: hostedApiTokenHash(TOKEN),
      now: NOW
    });
    assert.equal(written.console_kind, "hosted_research_console");
    assert.ok(written.bytes > 12000);
    const writtenHtml = await readFile(out, "utf8");
    assert.match(writtenHtml, /id="analysis-form"/);
    assert.equal(writtenHtml.includes("secret://"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
    if (sourceDir) await rm(sourceDir, { recursive: true, force: true });
  }
});

test("Phase 15 hosted console route serves the product shell and control-plane overview supports live analysis", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase15-hosted-"));
  let sourceDir = "";
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    const fixture = await createManagedConsoleFixture(rootDir);
    sourceDir = fixture.sourceDir;
    started = await startHostedServer({
      rootDir,
      configPath: fixture.configPath,
      apiToken: TOKEN,
      port: 0,
      now: NOW
    });

    const consoleResponse = await fetch(`${started.url}/console`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(consoleResponse.status, 200);
    const html = await consoleResponse.text();
    assert.match(html, /Hosted Research Console/);
    assert.match(html, /Save token locally/);
    assert.match(html, /Control Plane JSON/);
    assert.equal(html.includes("secret://"), false);
    assert.equal(html.includes(TOKEN), false);

    const control = await apiJson(started.url, "/api/control-plane");
    assert.equal(control.status, 200);
    assert.equal(control.body.data_vendor.status, "ready_for_external_data_vendor_boundary");
    assert.equal(control.body.llm_provider.status, "ready_for_external_llm_provider_boundary");

    const analysis = await apiJson(started.url, "/api/tenants/alpha/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        symbol: "NVDA",
        thesis: "phase fifteen hosted console analysis",
        ceiling: "watchlist",
        now: NOW
      }
    });
    assert.equal(analysis.status, 201);
    assert.equal(analysis.body.tenant_slug, "alpha");
    assert.match(analysis.body.audit_path, /tenants\/alpha\/audits/);

    const library = await apiJson(started.url, "/api/tenants/alpha/library", {
      tenant: "alpha"
    });
    assert.equal(library.status, 200);
    assert.equal(library.body.entries.some((entry: any) => entry.id === analysis.body.dossier_id), true);
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
    if (sourceDir) await rm(sourceDir, { recursive: true, force: true });
  }
});
