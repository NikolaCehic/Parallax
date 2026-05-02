import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId, stableHash } from "../core/ids.js";
import {
  loadManagedSaasConfig,
  managedSaasConfigPath,
  managedSaasReadiness,
  observabilitySummary
} from "../saas/managed.js";

export const PROVIDER_VALIDATION_FILE = "provider-validation.json";

const REQUIRED_PROVIDER_KINDS = [
  "identity_provider",
  "market_data_vendor",
  "llm_provider",
  "regulated_partner",
  "observability"
] as const;

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

export function providerValidationPath(rootDir = "managed-saas") {
  return path.join(rootDir, PROVIDER_VALIDATION_FILE);
}

function check(id: string, passed: boolean, detail: string, severity = "required") {
  return { id, passed, detail, severity };
}

function secretRecord(config: any, secretRef = "") {
  if (!secretRef) return undefined;
  return config.secret_refs.find((secret: any) =>
    secret.name === secretRef || secret.secret_ref === secretRef
  );
}

function sanitizedSecret(secret: any, integration: any) {
  if (!secret) {
    return {
      name: integration.secret_ref ? "missing" : "not_declared",
      secret_ref_hash: integration.secret_ref ? stableHash({ secretRef: integration.secret_ref }) : "",
      raw_secret_stored: false
    };
  }
  return {
    name: secret.name,
    provider: secret.provider,
    scope: secret.scope,
    secret_ref_hash: secret.secret_ref_hash,
    raw_secret_stored: secret.raw_secret_stored === true
  };
}

function commonChecks(config: any, integration: any) {
  const secret = secretRecord(config, integration.secret_ref);
  return [
    check("manifest_present", Boolean(integration.id), "Integration manifest is present."),
    check("provider_named", Boolean(integration.provider), "Provider name is declared."),
    check("secret_reference_registered", Boolean(secret), "External secret reference is registered."),
    check("raw_secret_not_stored", integration.raw_secret_stored === false && secret?.raw_secret_stored !== true, "No raw secret is stored in the manifest or secret registry."),
    check("validation_status_declared", Boolean(integration.validation_status), "Validation status is explicit."),
    check("production_not_enabled_by_manifest", integration.status !== "enabled_production", "Provider is not enabled for production by manifest.")
  ];
}

function kindChecks(integration: any, observability: any) {
  if (integration.kind === "identity_provider") {
    return [
      check("oidc_endpoint_https", /^https:\/\//.test(integration.endpoint ?? ""), "Identity provider endpoint is HTTPS."),
      check("sso_not_live", integration.status !== "enabled_production", "SSO is not treated as live production.")
    ];
  }
  if (integration.kind === "market_data_vendor") {
    return [
      check("data_license_declared", Boolean(integration.data_license) && integration.data_license !== "unlicensed", "Market-data license status is declared."),
      check("market_data_not_live", integration.status !== "enabled_production", "Market-data vendor is not treated as production live.")
    ];
  }
  if (integration.kind === "llm_provider") {
    return [
      check("llm_provider_not_live", integration.status !== "enabled_production", "External LLM provider is not treated as production live."),
      check("llm_notes_present", Boolean(integration.notes), "LLM manifest records validation or local-harness notes.", "warning")
    ];
  }
  if (integration.kind === "regulated_partner") {
    return [
      check("production_partner_locked", integration.status !== "enabled_production", "Regulated partner production adapter is locked."),
      check("legal_approval_not_assumed", integration.validation_status !== "production_validated", "Legal/compliance approval is not assumed from the manifest.")
    ];
  }
  if (integration.kind === "observability") {
    return [
      check("observability_events_present", observability.event_count > 0, "At least one managed observability event exists."),
      check("pii_not_logged_by_policy", true, "Observability scaffold stores local events only and blocks secret-like metadata.")
    ];
  }
  if (integration.kind === "storage") {
    return [
      check("storage_not_live", integration.status !== "enabled_production", "Managed storage is not treated as production live.", "warning")
    ];
  }
  return [
    check("unsupported_kind", false, `Unsupported integration kind: ${integration.kind}`)
  ];
}

function resultForIntegration(config: any, integration: any, observability: any) {
  const checks = [...commonChecks(config, integration), ...kindChecks(integration, observability)];
  const requiredFailures = checks.filter((item) => item.severity === "required" && !item.passed);
  const secret = sanitizedSecret(secretRecord(config, integration.secret_ref), integration);
  return {
    id: makeId("provider_val", {
      integration: integration.id,
      kind: integration.kind,
      provider: integration.provider,
      status: integration.status,
      validationStatus: integration.validation_status
    }),
    integration_id: integration.id,
    kind: integration.kind,
    name: integration.name,
    provider: integration.provider,
    manifest_status: integration.status,
    validation_status: integration.validation_status,
    tenant_slug: integration.tenant_slug,
    secret_ref_name: secret.name,
    secret_ref_hash: secret.secret_ref_hash,
    raw_secret_stored: secret.raw_secret_stored,
    status: requiredFailures.length === 0 ? "contract_validated" : "blocked",
    required_failure_count: requiredFailures.length,
    checks
  };
}

function missingRequiredKinds(config: any) {
  const present = new Set(config.integrations.map((integration: any) => integration.kind));
  return REQUIRED_PROVIDER_KINDS.filter((kind) => !present.has(kind));
}

export async function validateProviderContracts({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  out,
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  out?: string;
  now?: string;
} = {}) {
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const readiness = await managedSaasReadiness({ rootDir, configPath, now });
  const observability = await observabilitySummary(rootDir);
  const providers = config.integrations.map((integration: any) =>
    resultForIntegration(config, integration, observability)
  );
  const missingKinds = missingRequiredKinds(config);
  const managedSaasFailure = readiness.status === "ready_for_managed_beta_scaffold" ? 0 : 1;
  const requiredFailures = providers.reduce((sum: number, provider: any) => sum + provider.required_failure_count, 0) + missingKinds.length + managedSaasFailure;
  const warnings = providers.flatMap((provider: any) =>
    provider.checks.filter((item: any) => item.severity === "warning" && !item.passed)
  );
  const report = {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    status: requiredFailures === 0 ? "ready_for_provider_contract_beta" : "blocked",
    summary: {
      provider_count: providers.length,
      contract_validated_count: providers.filter((provider: any) => provider.status === "contract_validated").length,
      required_failure_count: requiredFailures,
      warning_count: warnings.length,
      missing_required_kinds: missingKinds,
      managed_saas_status: readiness.status,
      production_provider_count: providers.filter((provider: any) => provider.manifest_status === "enabled_production").length
    },
    controls: [
      check("managed_saas_ready", readiness.status === "ready_for_managed_beta_scaffold", "Managed SaaS scaffold readiness passed."),
      check("required_provider_manifests", missingKinds.length === 0, "Required provider manifests exist."),
      check("provider_contracts_validated", providers.every((provider: any) => provider.status === "contract_validated"), "Provider contract checks passed."),
      check("no_production_providers", providers.every((provider: any) => provider.manifest_status !== "enabled_production"), "No external provider is enabled for production."),
      check("secret_refs_sanitized", providers.every((provider: any) => provider.raw_secret_stored === false && !String(provider.secret_ref_name).startsWith("secret://")), "Provider report exposes secret names and hashes only."),
      check("external_production_validation_pending", providers.some((provider: any) => provider.validation_status !== "production_validated"), "External providers remain pending production validation.", "warning")
    ],
    providers
  };
  if (out) await writeJson(out, report);
  return {
    ...report,
    validation_path: out ?? ""
  };
}

export async function loadProviderValidationReport({
  rootDir = "managed-saas",
  validationPath = providerValidationPath(rootDir)
}: {
  rootDir?: string;
  validationPath?: string;
} = {}) {
  return readJsonIfExists(validationPath, {
    schema_version: "0.1.0",
    generated_at: "",
    root_dir: rootDir,
    status: "missing",
    summary: {
      provider_count: 0,
      contract_validated_count: 0,
      required_failure_count: 1,
      warning_count: 0,
      missing_required_kinds: [...REQUIRED_PROVIDER_KINDS],
      managed_saas_status: "unknown",
      production_provider_count: 0
    },
    controls: [],
    providers: []
  });
}
