import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, rm, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createManagedTenant,
  initializeManagedSaas,
  recordObservabilityEvent,
  registerExternalIntegration,
  registerSecretReference
} from "../src/saas/managed.js";
import {
  readTenantState,
  saveTenantStateValue,
  tenantPersistenceStatus
} from "../src/saas/persistence.js";
import {
  hostedApiStatus,
  startHostedServer
} from "../src/saas/server.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-02T10:00:00Z";
const TOKEN = "phase-11-hosted-token";

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

async function createManagedProviderFixture(rootDir: string, configPath = path.join(rootDir, "managed-saas.json")) {
  await initializeManagedSaas({
    rootDir,
    configPath,
    owner: "Phase Eleven Platform",
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
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase11/identity"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase11/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase11/llm"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase11/partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase11/observability"]
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
      dataLicense: "contract_required_before_shared_outputs",
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
    eventType: "hosted_api_fixture",
    severity: "info",
    message: "Phase 11 hosted API fixture.",
    metadata: { phase: 11 },
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

test("Phase 11 hosted API keeps tenants isolated while serving status, state, library, and analysis endpoints", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase11-api-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    await createManagedProviderFixture(rootDir, configPath);
    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0
    });

    const health = await apiJson(started.url, "/healthz", { token: "" });
    assert.equal(health.status, 200);
    assert.equal(health.body.status, "ok");
    assert.equal(health.body.raw_token_stored, false);

    const ready = await apiJson(started.url, "/readyz", { token: "" });
    assert.equal(ready.status, 200);
    assert.equal(ready.body.status, "ready_for_hosted_multi_tenant_api");
    assert.equal(ready.body.summary.tenant_count, 2);

    const unauthorized = await apiJson(started.url, "/api/control-plane", { token: "" });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.body.error, "unauthorized");

    const controlPlane = await apiJson(started.url, "/api/control-plane");
    assert.equal(controlPlane.status, 200);
    assert.equal(controlPlane.body.hosted_api.status, "ready_for_hosted_multi_tenant_api");
    assert.equal(controlPlane.body.hosted_api.summary.raw_token_stored, false);

    const stateWrite = await apiJson(started.url, "/api/tenants/alpha/state", {
      method: "POST",
      tenant: "alpha",
      body: {
        key: "watchlist.filter",
        value: { symbols: ["NVDA"], horizon: "swing" },
        actor: "phase11_test",
        now: NOW
      }
    });
    assert.equal(stateWrite.status, 200);
    assert.equal(stateWrite.body.key, "watchlist.filter");

    const alphaState = await apiJson(started.url, "/api/tenants/alpha/state", { tenant: "alpha" });
    assert.equal(alphaState.status, 200);
    assert.deepEqual(alphaState.body.values["watchlist.filter"], { symbols: ["NVDA"], horizon: "swing" });

    const crossTenantDenied = await apiJson(started.url, "/api/tenants/beta/state", { tenant: "alpha" });
    assert.equal(crossTenantDenied.status, 403);
    assert.equal(crossTenantDenied.body.error, "forbidden");

    const secretRejected = await apiJson(started.url, "/api/tenants/alpha/state", {
      method: "POST",
      tenant: "alpha",
      body: {
        key: "provider.payload",
        value: { private_key: "never-store-this" }
      }
    });
    assert.equal(secretRejected.status, 400);
    assert.equal(secretRejected.body.error, "bad_request");

    const created = await apiJson(started.url, "/api/tenants/alpha/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        symbol: "NVDA",
        horizon: "swing",
        thesis: "post-earnings continuation with risk-controlled invalidation",
        actor: "phase11_test",
        now: NOW
      }
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.tenant_slug, "alpha");
    assert.equal(created.body.audit_path.includes(path.join("tenants", "alpha", "audits")), true);

    const alphaLibrary = await apiJson(started.url, "/api/tenants/alpha/library", { tenant: "alpha" });
    assert.equal(alphaLibrary.status, 200);
    assert.equal(alphaLibrary.body.entries.length, 1);
    assert.equal(alphaLibrary.body.entries[0].symbol, "NVDA");

    const betaLibrary = await apiJson(started.url, "/api/tenants/beta/library", { tenant: "beta" });
    assert.equal(betaLibrary.status, 200);
    assert.equal(betaLibrary.body.entries.length, 0);

    const events = await apiJson(started.url, "/api/tenants/alpha/events", { tenant: "alpha" });
    assert.equal(events.status, 200);
    assert.ok(events.body.events.some((event: any) => event.event_type === "tenant_state_write"));
    assert.ok(events.body.events.some((event: any) => event.event_type === "tenant_analysis_created"));

    const consoleResponse = await fetch(`${started.url}/console`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(consoleResponse.status, 200);
    const consoleHtml = await consoleResponse.text();
    assert.match(consoleHtml, /Parallax Hosted Console/);
    assert.equal(consoleHtml.includes("secret://"), false);
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 11 tenant persistence helpers and CLI smoke commands produce human-readable hosted API outputs", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase11-cli-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    await createManagedProviderFixture(rootDir, configPath);

    const status = await hostedApiStatus({
      rootDir,
      configPath,
      apiTokenHash: "configured",
      now: NOW
    });
    assert.equal(status.status, "ready_for_hosted_multi_tenant_api");

    await assert.rejects(() => saveTenantStateValue({
      rootDir,
      configPath,
      tenantSlug: "alpha",
      key: "provider.payload",
      value: { access_token: "never-store-this" },
      now: NOW
    }), /Sensitive payload/);

    const saved = await saveTenantStateValue({
      rootDir,
      configPath,
      tenantSlug: "alpha",
      key: "screen.settings",
      value: { symbols: ["NVDA"], mode: "research" },
      actor: "phase11_helper",
      now: NOW
    });
    assert.equal(saved.state.values["screen.settings"].mode, "research");
    const state = await readTenantState({ rootDir, configPath, tenantSlug: "alpha" });
    assert.equal(state.values["screen.settings"].symbols[0], "NVDA");
    const persistence = await tenantPersistenceStatus({ rootDir, configPath, now: NOW });
    assert.equal(persistence.status, "ready_for_tenant_persistence");
    assert.equal(persistence.summary.tenant_count, 2);
    assert.equal(persistence.summary.total_state_key_count, 1);

    const hostedStatusText = runCli([
      "hosted-api-status",
      "--root-dir", rootDir,
      "--api-token", TOKEN,
      "--now", NOW
    ]);
    assert.match(hostedStatusText, /Parallax Hosted API Status/);
    assert.match(hostedStatusText, /ready_for_hosted_multi_tenant_api/);
    assert.equal(hostedStatusText.includes(TOKEN), false);

    const hostedStatusJson = JSON.parse(runCli([
      "hosted-api-status",
      "--root-dir", rootDir,
      "--api-token", TOKEN,
      "--json",
      "--now", NOW
    ]));
    assert.equal(hostedStatusJson.status, "ready_for_hosted_multi_tenant_api");
    assert.equal(hostedStatusJson.summary.raw_token_stored, false);

    const persistenceText = runCli([
      "tenant-persistence",
      "--root-dir", rootDir,
      "--now", NOW
    ]);
    assert.match(persistenceText, /Parallax Tenant Persistence/);
    assert.match(persistenceText, /alpha/);
    assert.match(persistenceText, /beta/);

    const stateSetJson = JSON.parse(runCli([
      "tenant-state-set",
      "--root-dir", rootDir,
      "--tenant", "beta",
      "--key", "screen.settings",
      "--value", "{\"symbols\":[\"NVDA\"],\"mode\":\"review\"}",
      "--json",
      "--now", NOW
    ]));
    assert.equal(stateSetJson.state.tenant_slug, "beta");
    assert.equal(stateSetJson.state.values["screen.settings"].mode, "review");

    const betaStatePath = path.join(rootDir, "tenants", "beta", "tenant-state.json");
    const betaState = JSON.parse(await readFile(betaStatePath, "utf8"));
    assert.equal(betaState.values["screen.settings"].symbols[0], "NVDA");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
