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
  providerValidationPath,
  validateProviderContracts
} from "../src/providers/validation.js";
import { writeHostedConsole } from "../src/app/hosted_console.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-01T19:00:00Z";

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
    owner: "Phase Ten Platform",
    now: NOW
  });
  await createManagedTenant({
    rootDir,
    configPath,
    slug: "alpha",
    name: "Alpha Research",
    owner: "Alpha Owner",
    now: NOW
  });
  for (const [name, scope, secretRef] of [
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase10/identity"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase10/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase10/llm"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase10/partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase10/observability"]
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
    eventType: "provider_validation",
    severity: "info",
    message: "Phase 10 provider validation fixture.",
    metadata: { phase: 10 },
    now: NOW
  });
  return { rootDir, configPath };
}

test("Phase 10 provider validation and hosted console validate contracts without exposing raw secrets", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase10-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    await createManagedProviderFixture(rootDir, configPath);

    const validation = await validateProviderContracts({
      rootDir,
      configPath,
      out: providerValidationPath(rootDir),
      now: "2026-05-01T19:05:00Z"
    });
    assert.equal(validation.status, "ready_for_provider_contract_beta");
    assert.equal(validation.summary.provider_count, 5);
    assert.equal(validation.summary.contract_validated_count, 5);
    assert.equal(validation.summary.required_failure_count, 0);
    assert.equal(validation.providers.every((provider: any) => provider.raw_secret_stored === false), true);
    assert.equal(validation.providers.some((provider: any) => String(provider.secret_ref_name).startsWith("secret://")), false);
    assert.ok(validation.providers.find((provider: any) => provider.kind === "identity_provider").checks.some((check: any) => check.id === "oidc_endpoint_https" && check.passed));
    assert.ok(validation.providers.find((provider: any) => provider.kind === "market_data_vendor").checks.some((check: any) => check.id === "data_license_declared" && check.passed));
    assert.ok(validation.providers.find((provider: any) => provider.kind === "observability").checks.some((check: any) => check.id === "observability_events_present" && check.passed));

    const consoleResult = await writeHostedConsole({
      rootDir,
      configPath,
      out: path.join(rootDir, "hosted-console.html"),
      now: "2026-05-01T19:06:00Z"
    });
    assert.ok(consoleResult.bytes > 1000);
    const html = await readFile(consoleResult.out, "utf8");
    assert.match(html, /Parallax Hosted Console/);
    assert.match(html, /Provider Contracts/);
    assert.match(html, /ready_for_provider_contract_beta/);
    assert.equal(html.includes("secret://"), false);

    const invalidRoot = await mkdtemp(path.join(os.tmpdir(), "parallax-phase10-invalid-"));
    const invalidConfig = path.join(invalidRoot, "managed-saas.json");
    try {
      await createManagedProviderFixture(invalidRoot, invalidConfig);
      await registerExternalIntegration({
        rootDir: invalidRoot,
        configPath: invalidConfig,
        kind: "market_data_vendor",
        name: "Unlicensed Market Data",
        provider: "unlicensed_vendor",
        secretRef: "MARKET_DATA_VENDOR",
        dataLicense: "",
        now: NOW
      });
      const blocked = await validateProviderContracts({
        rootDir: invalidRoot,
        configPath: invalidConfig,
        now: "2026-05-01T19:07:00Z"
      });
      assert.equal(blocked.status, "blocked");
      assert.ok(blocked.providers.some((provider: any) =>
        provider.name === "Unlicensed Market Data" &&
        provider.checks.some((check: any) => check.id === "data_license_declared" && !check.passed)
      ));
    } finally {
      await rm(invalidRoot, { recursive: true, force: true });
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 10 CLI exposes provider validation and hosted console workflow", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase10-cli-"));
  try {
    runCli([
      "saas-init",
      "--root-dir", rootDir,
      "--owner", "CLI Platform",
      "--now", NOW
    ]);
    runCli([
      "tenant-create",
      "--root-dir", rootDir,
      "--slug", "alpha",
      "--name", "Alpha Research",
      "--now", NOW
    ]);
    for (const [name, scope, secretRef] of [
      ["IDENTITY_PROVIDER", "identity_provider", "secret://phase10-cli/identity"],
      ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase10-cli/market-data"],
      ["LLM_PROVIDER", "llm_provider", "secret://phase10-cli/llm"],
      ["REGULATED_PARTNER", "regulated_partner", "secret://phase10-cli/partner"],
      ["OBSERVABILITY_VENDOR", "observability", "secret://phase10-cli/observability"]
    ]) {
      runCli([
        "secret-ref-add",
        "--root-dir", rootDir,
        "--name", name,
        "--scope", scope,
        "--ref", secretRef,
        "--now", NOW
      ]);
    }
    for (const args of [
      ["--kind", "identity_provider", "--name", "OIDC Contract", "--provider", "enterprise_oidc", "--secret-ref", "IDENTITY_PROVIDER", "--endpoint", "https://idp.example.invalid/oauth2", "--notes", "OIDC discovery contract pending production validation."],
      ["--kind", "market_data_vendor", "--name", "Market Data Contract", "--provider", "licensed_vendor", "--secret-ref", "MARKET_DATA_VENDOR", "--tenant", "alpha", "--data-license", "contract_required_before_shared_outputs", "--notes", "License contract pending production validation."],
      ["--kind", "llm_provider", "--name", "LLM Contract", "--provider", "model_gateway", "--secret-ref", "LLM_PROVIDER", "--notes", "Council eval gate required before production."],
      ["--kind", "regulated_partner", "--name", "Partner Contract", "--provider", "regulated_partner", "--secret-ref", "REGULATED_PARTNER", "--status", "disabled_until_legal_approval", "--notes", "Legal approval not assumed."],
      ["--kind", "observability", "--name", "Observability Contract", "--provider", "managed_logs", "--secret-ref", "OBSERVABILITY_VENDOR", "--notes", "PII retention review pending."]
    ]) {
      runCli([
        "integration-add",
        "--root-dir", rootDir,
        ...args,
        "--now", NOW
      ]);
    }
    runCli([
      "observability-record",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--type", "provider_validation",
      "--message", "CLI provider validation event",
      "--metadata", "{\"phase\":10}",
      "--now", NOW
    ]);

    const validation = runCli([
      "provider-validate",
      "--root-dir", rootDir,
      "--now", "2026-05-01T19:05:00Z"
    ]);
    assert.match(validation, /Parallax Provider Validation/);
    assert.match(validation, /ready_for_provider_contract_beta/);
    assert.equal(validation.includes("secret://"), false);

    const statusJson = runCli([
      "provider-status",
      "--root-dir", rootDir,
      "--json"
    ]);
    const status = JSON.parse(statusJson);
    assert.equal(status.status, "ready_for_provider_contract_beta");
    assert.equal(status.summary.provider_count, 5);

    const consolePath = path.join(rootDir, "hosted-console.html");
    const consoleOutput = runCli([
      "hosted-console",
      "--root-dir", rootDir,
      "--out", consolePath,
      "--now", "2026-05-01T19:06:00Z"
    ]);
    assert.match(consoleOutput, /Parallax Hosted Console/);
    const html = await readFile(consolePath, "utf8");
    assert.match(html, /Parallax Hosted Console/);
    assert.match(html, /ready_for_provider_contract_beta/);
    assert.equal(html.includes("secret://"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
