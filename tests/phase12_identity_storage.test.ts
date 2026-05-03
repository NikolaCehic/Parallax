import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
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
  identityStatus,
  initializeIdentityDirectory,
  issueIdentitySession,
  registerIdentityPrincipal,
  verifyIdentitySession
} from "../src/saas/identity.js";
import {
  createStorageCheckpoint,
  durableStorageStatus,
  initializeDurableStorage,
  readDurableObject,
  writeDurableObject
} from "../src/saas/storage.js";
import {
  hostedFoundationStatus,
  startHostedServer
} from "../src/saas/server.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-03T10:00:00Z";
const TOKEN = "phase-12-hosted-token";

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
    owner: "Phase Twelve Platform",
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
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase12/identity"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase12/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase12/llm"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase12/partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase12/observability"]
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
    eventType: "identity_storage_fixture",
    severity: "info",
    message: "Phase 12 identity and storage fixture.",
    metadata: { phase: 12 },
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

async function prepareIdentityAndStorage(rootDir: string, configPath: string) {
  await initializeIdentityDirectory({ rootDir, issuer: "phase12-local-idp", now: NOW });
  await registerIdentityPrincipal({
    rootDir,
    configPath,
    email: "alpha.admin@example.com",
    name: "Alpha Admin",
    tenantSlug: "alpha",
    role: "tenant_admin",
    now: NOW
  });
  await registerIdentityPrincipal({
    rootDir,
    configPath,
    email: "platform.admin@example.com",
    name: "Platform Admin",
    role: "platform_admin",
    now: NOW
  });
  await initializeDurableStorage({ rootDir, configPath, provider: "local_durable_storage", now: NOW });
  await writeDurableObject({
    rootDir,
    configPath,
    tenantSlug: "alpha",
    key: "screen.cache",
    value: { symbols: ["NVDA"], mode: "research" },
    now: NOW
  });
  await createStorageCheckpoint({
    rootDir,
    configPath,
    tenantSlug: "alpha",
    label: "phase12-baseline",
    now: NOW
  });
}

test("Phase 12 identity sessions and durable storage enforce scoped tenant access through the hosted API", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase12-api-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    await createManagedProviderFixture(rootDir, configPath);
    await prepareIdentityAndStorage(rootDir, configPath);

    const alphaSession = await issueIdentitySession({
      rootDir,
      email: "alpha.admin@example.com",
      tenantSlug: "alpha",
      ttlMinutes: 30,
      now: NOW
    });
    const platformSession = await issueIdentitySession({
      rootDir,
      email: "platform.admin@example.com",
      ttlMinutes: 30,
      now: NOW
    });
    assert.equal(alphaSession.raw_session_token_stored, false);
    const directoryText = await readFile(path.join(rootDir, "identity-directory.json"), "utf8");
    assert.equal(directoryText.includes(alphaSession.session_token), false);
    assert.equal(directoryText.includes(platformSession.session_token), false);

    const verified = await verifyIdentitySession({
      rootDir,
      sessionToken: alphaSession.session_token,
      tenantSlug: "alpha",
      requiredScope: "storage:write",
      now: NOW
    });
    assert.equal(verified.principal.email, "alpha.admin@example.com");

    const identity = await identityStatus({ rootDir, configPath, now: NOW });
    assert.equal(identity.status, "ready_for_identity_foundation");
    assert.equal(identity.summary.active_session_count, 2);

    const storage = await durableStorageStatus({ rootDir, configPath, now: NOW });
    assert.equal(storage.status, "ready_for_durable_storage_foundation");
    assert.equal(storage.summary.object_count, 1);
    assert.equal(storage.summary.checkpoint_count, 1);
    const object = await readDurableObject({ rootDir, tenantSlug: "alpha", key: "screen.cache" });
    assert.equal(object.object.value.symbols[0], "NVDA");

    const foundation = await hostedFoundationStatus({
      rootDir,
      configPath,
      apiTokenHash: "configured",
      now: NOW
    });
    assert.equal(foundation.status, "ready_for_identity_storage_foundation");
    assert.equal(foundation.summary.raw_session_token_stored, false);
    assert.equal(foundation.summary.direct_cloud_storage_connection, false);

    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0
    });

    const issued = await apiJson(started.url, "/api/identity/sessions", {
      method: "POST",
      body: {
        email: "alpha.admin@example.com",
        tenant_slug: "alpha",
        ttl_minutes: 20,
        now: NOW
      }
    });
    assert.equal(issued.status, 201);
    assert.equal(issued.body.raw_session_token_stored, false);
    const apiSessionToken = issued.body.session_token;
    assert.equal(String(apiSessionToken).startsWith("psess_"), true);

    const controlDenied = await apiJson(started.url, "/api/foundation", {
      token: apiSessionToken
    });
    assert.equal(controlDenied.status, 403);

    const foundationViaPlatform = await apiJson(started.url, "/api/foundation", {
      token: platformSession.session_token
    });
    assert.equal(foundationViaPlatform.status, 200);
    assert.equal(foundationViaPlatform.body.status, "ready_for_identity_storage_foundation");

    const storageWrite = await apiJson(started.url, "/api/tenants/alpha/storage", {
      method: "POST",
      token: apiSessionToken,
      tenant: "alpha",
      body: {
        key: "session.cache",
        value: { symbols: ["NVDA"], source: "identity-session" },
        now: NOW
      }
    });
    assert.equal(storageWrite.status, 201);
    assert.equal(storageWrite.body.object.tenant_slug, "alpha");

    const storageRead = await apiJson(started.url, "/api/tenants/alpha/storage?key=session.cache", {
      token: apiSessionToken,
      tenant: "alpha"
    });
    assert.equal(storageRead.status, 200);
    assert.equal(storageRead.body.object.value.source, "identity-session");

    const crossTenantDenied = await apiJson(started.url, "/api/tenants/beta/storage?key=session.cache", {
      token: apiSessionToken,
      tenant: "beta"
    });
    assert.equal(crossTenantDenied.status, 403);

    const analysis = await apiJson(started.url, "/api/tenants/alpha/analyze", {
      method: "POST",
      token: apiSessionToken,
      tenant: "alpha",
      body: {
        symbol: "NVDA",
        horizon: "swing",
        thesis: "identity-scoped analyst session creates an auditable tenant thesis",
        now: NOW
      }
    });
    assert.equal(analysis.status, 201);
    assert.equal(analysis.body.tenant_slug, "alpha");

    const secretRejected = await apiJson(started.url, "/api/tenants/alpha/storage", {
      method: "POST",
      token: apiSessionToken,
      tenant: "alpha",
      body: {
        key: "bad.payload",
        value: { access_token: "never-store-this" }
      }
    });
    assert.equal(secretRejected.status, 400);
    assert.equal(secretRejected.body.error, "bad_request");
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 12 CLI exposes identity, storage, and hosted-foundation readiness workflow", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase12-cli-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    await createManagedProviderFixture(rootDir, configPath);

    const identityInit = runCli([
      "identity-init",
      "--root-dir", rootDir,
      "--issuer", "phase12-cli-idp",
      "--now", NOW
    ]);
    assert.match(identityInit, /Parallax Identity Foundation/);

    const principal = runCli([
      "identity-principal-add",
      "--root-dir", rootDir,
      "--email", "alpha.cli@example.com",
      "--name", "Alpha CLI",
      "--tenant", "alpha",
      "--role", "tenant_admin",
      "--now", NOW
    ]);
    assert.match(principal, /alpha\.cli@example\.com/);

    const session = JSON.parse(runCli([
      "identity-session-issue",
      "--root-dir", rootDir,
      "--email", "alpha.cli@example.com",
      "--tenant", "alpha",
      "--ttl-minutes", "30",
      "--json",
      "--now", NOW
    ]));
    assert.equal(session.raw_session_token_stored, false);
    assert.equal(String(session.session_token).startsWith("psess_"), true);
    const directoryText = await readFile(path.join(rootDir, "identity-directory.json"), "utf8");
    assert.equal(directoryText.includes(session.session_token), false);

    const storageInit = runCli([
      "storage-init",
      "--root-dir", rootDir,
      "--provider", "local_durable_storage",
      "--now", NOW
    ]);
    assert.match(storageInit, /Parallax Durable Storage/);

    const objectPut = JSON.parse(runCli([
      "storage-object-put",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--key", "screen.cache",
      "--value", "{\"symbols\":[\"NVDA\"],\"mode\":\"review\"}",
      "--json",
      "--now", NOW
    ]));
    assert.equal(objectPut.object.tenant_slug, "alpha");
    assert.equal(objectPut.object.key, "screen.cache");

    const checkpoint = runCli([
      "storage-checkpoint",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--label", "cli-baseline",
      "--now", NOW
    ]);
    assert.match(checkpoint, /Parallax Storage Checkpoint/);

    const storageStatus = runCli([
      "storage-status",
      "--root-dir", rootDir,
      "--now", NOW
    ]);
    assert.match(storageStatus, /ready_for_durable_storage_foundation/);

    const foundationJson = JSON.parse(runCli([
      "hosted-foundation-status",
      "--root-dir", rootDir,
      "--api-token", TOKEN,
      "--json",
      "--now", NOW
    ]));
    assert.equal(foundationJson.status, "ready_for_identity_storage_foundation");
    assert.equal(foundationJson.summary.raw_token_stored, false);
    assert.equal(foundationJson.summary.raw_session_token_stored, false);
    assert.equal(foundationJson.summary.raw_secret_stored, false);

    const identityText = runCli([
      "identity-status",
      "--root-dir", rootDir,
      "--now", NOW
    ]);
    assert.match(identityText, /Active sessions: 1/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
