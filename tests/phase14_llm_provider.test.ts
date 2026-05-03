import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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
  llmProviderStatus,
  registerLLMProviderAdapter,
  runLLMProviderReplayAnalysis
} from "../src/saas/llm_provider.js";
import { startHostedServer } from "../src/saas/server.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-03T10:00:00Z";
const TOKEN = "phase-14-hosted-token";
const PHASE14_PERSONAS = [
  "quant_researcher",
  "data_quality_officer",
  "model_validator",
  "red_team_skeptic"
];

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
    owner: "Phase Fourteen Platform",
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
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase14/identity"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase14/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase14/llm"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase14/partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase14/observability"]
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
    eventType: "llm_provider_fixture",
    severity: "info",
    message: "Phase 14 LLM provider fixture.",
    metadata: { phase: 14 },
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

test("Phase 14 external LLM provider boundary gates replay analysis with evals, budgets, and tenant-scoped status", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase14-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    await createManagedProviderFixture(rootDir, configPath);
    const adapter = await registerLLMProviderAdapter({
      rootDir,
      configPath,
      adapterId: "model-gateway-replay",
      name: "Model Gateway Replay",
      provider: "model_gateway",
      tenantSlug: "alpha",
      secretRef: "LLM_PROVIDER",
      modelRegistryRef: "model_gateway_replay_v0",
      allowedPersonas: PHASE14_PERSONAS,
      now: NOW
    });
    assert.equal(adapter.adapter.raw_secret_stored, false);
    assert.equal(adapter.adapter.direct_model_network_connection, false);
    assert.equal(adapter.adapter.eval_suite.passed, true);
    assert.equal(adapter.eval_suite.suite, "phase_14_external_llm_provider_boundary");

    const result = await runLLMProviderReplayAnalysis({
      rootDir,
      configPath,
      adapterId: "model-gateway-replay",
      tenantSlug: "alpha",
      symbol: "NVDA",
      thesis: "phase fourteen external model replay thesis",
      dataDir: "fixtures",
      actionCeiling: "watchlist",
      audit: true,
      now: NOW
    });
    assert.equal(result.run.council_eval_passed, true);
    assert.equal(result.run.raw_secret_stored, false);
    assert.equal(result.run.direct_model_network_connection, false);
    assert.equal(result.dossier.council_run.provider.kind, "llm_external_replay");
    assert.equal(result.dossier.council_run.contexts.every((context: any) => context.context_type === "evidence_only"), true);
    assert.equal(result.dossier.decision_packet.action_class !== "order_ticket_candidate", true);

    await registerLLMProviderAdapter({
      rootDir,
      configPath,
      adapterId: "model-gateway-beta",
      name: "Model Gateway Beta",
      provider: "model_gateway",
      tenantSlug: "beta",
      secretRef: "LLM_PROVIDER",
      modelRegistryRef: "model_gateway_beta_replay_v0",
      allowedPersonas: PHASE14_PERSONAS,
      now: NOW
    });
    const status = await llmProviderStatus({ rootDir, configPath, tenantSlug: "alpha", now: NOW });
    assert.equal(status.status, "ready_for_external_llm_provider_boundary");
    assert.equal(status.summary.adapter_count, 1);
    assert.equal(status.summary.run_count, 1);
    assert.equal(status.summary.raw_secret_stored, false);
    assert.equal(status.latest_events.every((event: any) => event.payload?.tenant_slug === "alpha"), true);

    await assert.rejects(() => runLLMProviderReplayAnalysis({
      rootDir,
      configPath,
      adapterId: "model-gateway-replay",
      tenantSlug: "alpha",
      symbol: "NVDA",
      thesis: "secret://never-send-this-to-a-model",
      dataDir: "fixtures",
      now: NOW
    }), /Sensitive LLM provider payload/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 14 CLI and hosted API expose human-readable external LLM replay without unsafe data_dir escape", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase14-cli-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    await createManagedProviderFixture(rootDir, configPath);

    const registered = runCli([
      "llm-provider-register",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--adapter", "model-gateway-replay",
      "--name", "Model Gateway Replay",
      "--provider", "model_gateway",
      "--secret-ref", "LLM_PROVIDER",
      "--model", "model_gateway_replay_v0",
      "--allowed-personas", PHASE14_PERSONAS.join(","),
      "--now", NOW
    ]);
    assert.match(registered, /Parallax LLM Provider Adapter/);
    assert.match(registered, /Eval passed: yes/);

    const analyzed = JSON.parse(runCli([
      "llm-provider-analyze",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--adapter", "model-gateway-replay",
      "--symbol", "NVDA",
      "--thesis", "cli external model replay thesis",
      "--json",
      "--now", NOW
    ]));
    assert.equal(analyzed.run.council_eval_passed, true);
    assert.equal(analyzed.run.direct_model_network_connection, false);

    const statusText = runCli([
      "llm-provider-status",
      "--root-dir", rootDir,
      "--now", NOW
    ]);
    assert.match(statusText, /ready_for_external_llm_provider_boundary/);
    assert.match(statusText, /Direct model network connection: no/);

    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0
    });

    const apiAnalysis = await apiJson(started.url, "/api/tenants/alpha/llm-provider/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        adapter_id: "model-gateway-replay",
        symbol: "NVDA",
        thesis: "hosted external LLM replay thesis",
        now: NOW
      }
    });
    assert.equal(apiAnalysis.status, 201);
    assert.equal(apiAnalysis.body.council_eval_passed, true);
    assert.equal(apiAnalysis.body.run.direct_model_network_connection, false);

    const apiStatus = await apiJson(started.url, "/api/llm-providers/status");
    assert.equal(apiStatus.status, 200);
    assert.equal(apiStatus.body.status, "ready_for_external_llm_provider_boundary");

    const tenantStatus = await apiJson(started.url, "/api/tenants/alpha/llm-provider", {
      tenant: "alpha"
    });
    assert.equal(tenantStatus.status, 200);
    assert.equal(tenantStatus.body.summary.adapter_count, 1);

    const escapedDataDir = await apiJson(started.url, "/api/tenants/alpha/llm-provider/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        adapter_id: "model-gateway-replay",
        symbol: "NVDA",
        thesis: "unsafe hosted data dir should be blocked",
        data_dir: path.resolve("fixtures"),
        now: NOW
      }
    });
    assert.equal(escapedDataDir.status, 403);
    assert.equal(escapedDataDir.body.error, "forbidden");

    const secretPayload = await apiJson(started.url, "/api/tenants/alpha/llm-provider/analyze", {
      method: "POST",
      tenant: "alpha",
      body: {
        adapter_id: "model-gateway-replay",
        symbol: "NVDA",
        thesis: "never expose secret://model-token",
        now: NOW
      }
    });
    assert.equal(secretPayload.status, 400);
    assert.equal(secretPayload.body.error, "bad_request");
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});
