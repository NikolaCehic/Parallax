import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createManagedTenant,
  exportManagedSaasPackage,
  initializeManagedSaas,
  loadManagedSaasConfig,
  managedSaasReadiness,
  managedSaasStatus,
  observabilitySummary,
  recordObservabilityEvent,
  registerExternalIntegration,
  registerSecretReference
} from "../src/saas/managed.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-01T18:00:00Z";

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

async function registerRequiredSecretRefs(rootDir: string, configPath: string) {
  for (const [name, scope, secretRef] of [
    ["IDENTITY_PROVIDER", "identity_provider", "secret://phase9/identity-provider"],
    ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase9/market-data"],
    ["LLM_PROVIDER", "llm_provider", "secret://phase9/llm-provider"],
    ["REGULATED_PARTNER", "regulated_partner", "secret://phase9/regulated-partner"],
    ["OBSERVABILITY_VENDOR", "observability", "secret://phase9/observability"]
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
}

async function registerRequiredIntegrations(rootDir: string, configPath: string) {
  for (const integration of [
    {
      kind: "identity_provider",
      name: "OIDC Placeholder",
      provider: "enterprise_oidc",
      secretRef: "IDENTITY_PROVIDER",
      notes: "SSO manifest exists; vendor credentials are external."
    },
    {
      kind: "market_data_vendor",
      name: "Licensed Market Data Placeholder",
      provider: "licensed_us_equities_vendor",
      secretRef: "MARKET_DATA_VENDOR",
      tenantSlug: "alpha",
      dataLicense: "contract_required"
    },
    {
      kind: "llm_provider",
      name: "LLM Provider Placeholder",
      provider: "model_gateway",
      secretRef: "LLM_PROVIDER"
    },
    {
      kind: "regulated_partner",
      name: "Regulated Partner Placeholder",
      provider: "regulated_execution_partner",
      secretRef: "REGULATED_PARTNER",
      status: "disabled_until_legal_approval"
    },
    {
      kind: "observability",
      name: "Observability Placeholder",
      provider: "managed_logs_metrics",
      secretRef: "OBSERVABILITY_VENDOR"
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
}

test("Phase 9 managed SaaS scaffold enforces tenant isolation, secret references, integration manifests, observability, and export", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase9-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    const initialized = await initializeManagedSaas({
      rootDir,
      configPath,
      owner: "Phase Nine Platform",
      now: NOW
    });
    assert.equal(initialized.config.secrets.raw_secret_storage_allowed, false);
    assert.equal(initialized.config.production_boundaries.direct_broker_connection, false);

    const alpha = await createManagedTenant({
      rootDir,
      configPath,
      slug: "alpha",
      name: "Alpha Research",
      owner: "Alpha Owner",
      now: NOW
    });
    const beta = await createManagedTenant({
      rootDir,
      configPath,
      slug: "beta",
      name: "Beta Research",
      owner: "Beta Owner",
      now: NOW
    });
    assert.match(alpha.tenant.audit_dir, /tenants\/alpha\/audits$/);
    assert.match(beta.tenant.audit_dir, /tenants\/beta\/audits$/);

    await assert.rejects(
      () => createManagedTenant({
        rootDir,
        configPath,
        slug: "../escape",
        name: "Escaped Tenant"
      }),
      /Tenant slug/
    );

    await registerRequiredSecretRefs(rootDir, configPath);
    await registerRequiredIntegrations(rootDir, configPath);

    await assert.rejects(
      () => recordObservabilityEvent({
        rootDir,
        tenantSlug: "alpha",
        eventType: "blocked_payload",
        metadata: { private_key: "never-store-this" }
      }),
      /Raw secret-like field/
    );

    const observed = await recordObservabilityEvent({
      rootDir,
      tenantSlug: "alpha",
      eventType: "readiness_check",
      severity: "info",
      message: "Phase 9 managed SaaS readiness smoke event.",
      metadata: { phase: 9 },
      now: NOW
    });
    assert.match(observed.observability_path, /observability-events\.jsonl$/);

    const readiness = await managedSaasReadiness({
      rootDir,
      configPath,
      now: "2026-05-01T18:05:00Z"
    });
    assert.equal(readiness.status, "ready_for_managed_beta_scaffold");
    assert.equal(readiness.summary.required_failed_count, 0);
    assert.equal(readiness.summary.tenant_count, 2);
    assert.equal(readiness.summary.integration_kinds.identity_provider, 1);
    assert.equal(readiness.summary.integration_kinds.market_data_vendor, 1);
    assert.equal(readiness.summary.integration_kinds.llm_provider, 1);
    assert.equal(readiness.summary.integration_kinds.regulated_partner, 1);
    assert.equal(readiness.summary.integration_kinds.observability, 1);
    assert.ok(readiness.controls.some((control: any) => control.id === "external_integrations_not_validated" && control.severity === "warning"));
    assert.equal(readiness.secret_refs.some((secret: any) => "secret_ref" in secret), false);
    assert.equal(readiness.secret_refs.every((secret: any) => secret.raw_secret_stored === false), true);

    const status = await managedSaasStatus({ rootDir, configPath });
    assert.equal(status.readiness.status, "ready_for_managed_beta_scaffold");
    assert.equal(status.production_boundaries.production_partner_adapter_default, "locked");

    const observability = await observabilitySummary(rootDir);
    assert.equal(observability.event_count, 1);
    assert.equal(observability.by_tenant.alpha, 1);

    const exported = await exportManagedSaasPackage({
      rootDir,
      configPath,
      out: path.join(rootDir, "managed-saas-package.json")
    });
    assert.equal(exported.readiness_status, "ready_for_managed_beta_scaffold");
    assert.equal(exported.tenant_count, 2);
    assert.match(await readFile(exported.out, "utf8"), /ready_for_managed_beta_scaffold/);

    const config = await loadManagedSaasConfig({ rootDir, configPath });
    assert.equal(config.secret_refs.every((secret: any) => secret.raw_secret_stored === false), true);
    assert.equal(config.integrations.every((integration: any) => integration.raw_secret_stored === false), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 9 CLI exposes human-readable managed SaaS workflow", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase9-cli-"));
  try {
    const initialized = runCli([
      "saas-init",
      "--root-dir", rootDir,
      "--owner", "CLI Platform",
      "--now", NOW
    ]);
    assert.match(initialized, /Parallax Managed SaaS Control Plane/);
    assert.match(initialized, /Raw secret storage: blocked/);

    const tenant = runCli([
      "tenant-create",
      "--root-dir", rootDir,
      "--slug", "alpha",
      "--name", "Alpha Research",
      "--owner", "Alpha Owner",
      "--now", NOW
    ]);
    assert.match(tenant, /Parallax Managed Tenant/);
    assert.match(tenant, /Slug: alpha/);

    for (const [name, scope, secretRef] of [
      ["IDENTITY_PROVIDER", "identity_provider", "secret://phase9-cli/identity-provider"],
      ["MARKET_DATA_VENDOR", "market_data_vendor", "secret://phase9-cli/market-data"],
      ["LLM_PROVIDER", "llm_provider", "secret://phase9-cli/llm-provider"],
      ["REGULATED_PARTNER", "regulated_partner", "secret://phase9-cli/regulated-partner"],
      ["OBSERVABILITY_VENDOR", "observability", "secret://phase9-cli/observability"]
    ]) {
      const output = runCli([
        "secret-ref-add",
        "--root-dir", rootDir,
        "--name", name,
        "--scope", scope,
        "--ref", secretRef,
        "--now", NOW
      ]);
      assert.match(output, /Parallax Secret Reference/);
      assert.doesNotMatch(output, new RegExp(secretRef));
    }

    for (const args of [
      ["--kind", "identity_provider", "--name", "OIDC Placeholder", "--provider", "enterprise_oidc", "--secret-ref", "IDENTITY_PROVIDER"],
      ["--kind", "market_data_vendor", "--name", "Market Data Placeholder", "--provider", "licensed_vendor", "--secret-ref", "MARKET_DATA_VENDOR", "--tenant", "alpha"],
      ["--kind", "llm_provider", "--name", "LLM Placeholder", "--provider", "model_gateway", "--secret-ref", "LLM_PROVIDER"],
      ["--kind", "regulated_partner", "--name", "Partner Placeholder", "--provider", "regulated_partner", "--secret-ref", "REGULATED_PARTNER", "--status", "disabled_until_legal_approval"],
      ["--kind", "observability", "--name", "Logs Placeholder", "--provider", "managed_logs", "--secret-ref", "OBSERVABILITY_VENDOR"]
    ]) {
      const output = runCli([
        "integration-add",
        "--root-dir", rootDir,
        ...args,
        "--now", NOW
      ]);
      assert.match(output, /Parallax External Integration Manifest/);
      assert.match(output, /Raw secret stored: no/);
    }

    const observed = runCli([
      "observability-record",
      "--root-dir", rootDir,
      "--tenant", "alpha",
      "--type", "readiness_check",
      "--severity", "info",
      "--message", "CLI managed SaaS smoke event",
      "--metadata", "{\"phase\":9}",
      "--now", NOW
    ]);
    assert.match(observed, /Parallax Observability Event/);

    const readiness = runCli([
      "saas-readiness",
      "--root-dir", rootDir,
      "--now", "2026-05-01T18:05:00Z"
    ]);
    assert.match(readiness, /ready_for_managed_beta_scaffold/);
    assert.match(readiness, /tenant_isolation/);
    assert.match(readiness, /secret_refs_only/);

    const statusJson = runCli([
      "saas-status",
      "--root-dir", rootDir,
      "--json"
    ]);
    const status = JSON.parse(statusJson);
    assert.equal(status.readiness.status, "ready_for_managed_beta_scaffold");
    assert.equal(status.readiness.summary.integration_count, 5);

    const exported = runCli([
      "saas-export",
      "--root-dir", rootDir,
      "--out", path.join(rootDir, "managed-saas-export.json")
    ]);
    assert.match(exported, /Parallax Managed SaaS Export/);
    assert.match(exported, /ready_for_managed_beta_scaffold/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
