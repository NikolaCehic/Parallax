import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId, stableHash } from "../core/ids.js";

export const MANAGED_SAAS_FILE = "managed-saas.json";
export const OBSERVABILITY_FILE = "observability-events.jsonl";

const SUPPORTED_INTEGRATION_KINDS = [
  "identity_provider",
  "market_data_vendor",
  "llm_provider",
  "regulated_partner",
  "storage",
  "observability"
] as const;

const REQUIRED_INTEGRATION_KINDS = [
  "identity_provider",
  "market_data_vendor",
  "llm_provider",
  "regulated_partner",
  "observability"
] as const;

const REQUIRED_INTEGRATION_LABELS: Record<string, string> = {
  identity_provider: "Identity provider manifest exists.",
  market_data_vendor: "Market-data vendor manifest exists.",
  llm_provider: "LLM provider manifest exists.",
  regulated_partner: "Regulated partner manifest exists.",
  observability: "Observability provider manifest exists."
};

async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

function parseJsonLines(text = "") {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function managedSaasConfigPath(rootDir = "managed-saas") {
  return path.join(rootDir, MANAGED_SAAS_FILE);
}

export function observabilityPath(rootDir = "managed-saas") {
  return path.join(rootDir, OBSERVABILITY_FILE);
}

function normalizeSlug(slug: string) {
  const normalized = slug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{1,62}$/.test(normalized)) {
    throw new Error("Tenant slug must be 2-63 chars and contain only lowercase letters, numbers, hyphen, or underscore.");
  }
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Tenant slug cannot contain path traversal characters.");
  }
  return normalized;
}

function assertInsideRoot(rootDir: string, candidate: string) {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Resolved tenant path escapes managed SaaS root: ${candidate}`);
  }
}

function tenantAuditDir(rootDir: string, slug: string) {
  const normalized = normalizeSlug(slug);
  const auditDir = path.join(rootDir, "tenants", normalized, "audits");
  assertInsideRoot(rootDir, auditDir);
  return auditDir;
}

function defaultConfig({
  rootDir = "managed-saas",
  owner = "platform_owner",
  environment = "managed_beta",
  now = isoNow()
}: {
  rootDir?: string;
  owner?: string;
  environment?: string;
  now?: string;
} = {}) {
  return {
    schema_version: "0.1.0",
    control_plane_id: makeId("saas_cp", { rootDir, owner, environment, now }),
    environment,
    root_dir: rootDir,
    owner,
    created_at: now,
    tenancy: {
      isolation_model: "tenant_directory_per_workspace",
      path_traversal_protection: true,
      cross_tenant_queries_allowed: false,
      default_region: "local_dev",
      pii_storage: "not_configured"
    },
    identity: {
      sso_required_for_managed_saas: true,
      local_bearer_tokens_allowed_for_private_beta: true,
      configured_provider_count: 0
    },
    secrets: {
      storage_model: "external_secret_references_only",
      raw_secret_storage_allowed: false,
      rotation_required_days: 90
    },
    observability: {
      event_file: observabilityPath(rootDir),
      audit_events_required: true,
      pii_in_logs_allowed: false
    },
    production_boundaries: {
      direct_broker_connection: false,
      production_partner_adapter_default: "locked",
      external_provider_credentials_required: true
    },
    tenants: [],
    secret_refs: [],
    integrations: []
  };
}

export async function loadManagedSaasConfig({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir)
}: {
  rootDir?: string;
  configPath?: string;
} = {}) {
  const config = await readJsonIfExists(configPath, defaultConfig({ rootDir }));
  return {
    ...defaultConfig({ rootDir }),
    ...config,
    root_dir: rootDir,
    tenants: config.tenants ?? [],
    secret_refs: config.secret_refs ?? [],
    integrations: config.integrations ?? []
  };
}

export async function saveManagedSaasConfig(rootDir: string, config: any, configPath = managedSaasConfigPath(rootDir)) {
  const next = {
    ...config,
    schema_version: "0.1.0",
    root_dir: rootDir,
    updated_at: isoNow()
  };
  await writeJson(configPath, next);
  return next;
}

export async function initializeManagedSaas({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  owner = "platform_owner",
  environment = "managed_beta",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  owner?: string;
  environment?: string;
  now?: string;
} = {}) {
  const config = defaultConfig({ rootDir, owner, environment, now });
  await mkdir(path.join(rootDir, "tenants"), { recursive: true });
  await writeJson(configPath, config);
  return {
    config,
    config_path: configPath
  };
}

export async function createManagedTenant({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  slug,
  name,
  owner = "tenant_owner",
  plan = "private_beta",
  region = "local_dev",
  dataResidency = "local_dev",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  slug: string;
  name: string;
  owner?: string;
  plan?: string;
  region?: string;
  dataResidency?: string;
  now?: string;
}) {
  const normalized = normalizeSlug(slug);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  if (config.tenants.some((tenant: any) => tenant.slug === normalized)) {
    throw new Error(`Tenant ${normalized} already exists.`);
  }
  const auditDir = tenantAuditDir(rootDir, normalized);
  await mkdir(auditDir, { recursive: true });
  const tenant = {
    id: makeId("tenant", { normalized, name, owner, now }),
    slug: normalized,
    name,
    owner,
    plan,
    region,
    data_residency: dataResidency,
    status: "active",
    audit_dir: auditDir,
    created_at: now
  };
  const saved = await saveManagedSaasConfig(rootDir, {
    ...config,
    tenants: [...config.tenants, tenant]
  }, configPath);
  return {
    tenant,
    tenant_count: saved.tenants.length,
    config_path: configPath
  };
}

function assertNoRawSecret(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Raw secret-like field is not allowed: ${forbidden}`);
    }
  }
}

export async function registerSecretReference({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  name,
  provider = "external_secret_manager",
  scope,
  secretRef,
  owner = "platform_security",
  rotationDays = 90,
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  name: string;
  provider?: string;
  scope: string;
  secretRef: string;
  owner?: string;
  rotationDays?: number;
  now?: string;
}) {
  if (!secretRef || !/^(secret|vault|aws-sm|gcp-sm|azure-kv):\/\//.test(secretRef)) {
    throw new Error("Secret references must use secret://, vault://, aws-sm://, gcp-sm://, or azure-kv://.");
  }
  assertNoRawSecret({ name, provider, scope, secretRef, owner });
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const secret = {
    id: makeId("secret_ref", { name, provider, scope, secretRef }),
    name,
    provider,
    scope,
    secret_ref: secretRef,
    secret_ref_hash: stableHash({ secretRef }),
    owner,
    rotation_days: rotationDays,
    created_at: now,
    raw_secret_stored: false
  };
  const saved = await saveManagedSaasConfig(rootDir, {
    ...config,
    secret_refs: [
      ...config.secret_refs.filter((item: any) => item.name !== name),
      secret
    ]
  }, configPath);
  return {
    secret,
    secret_ref_count: saved.secret_refs.length,
    config_path: configPath
  };
}

function assertSupportedIntegrationKind(kind: string) {
  if (!SUPPORTED_INTEGRATION_KINDS.includes(kind as any)) {
    throw new Error(`Unsupported integration kind: ${kind}`);
  }
}

export async function registerExternalIntegration({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  kind,
  name,
  provider,
  status = "disabled_until_configured",
  validationStatus = "not_validated",
  tenantSlug = "",
  secretRef = "",
  dataLicense = "",
  endpoint = "",
  notes = "",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  kind: string;
  name: string;
  provider: string;
  status?: string;
  validationStatus?: string;
  tenantSlug?: string;
  secretRef?: string;
  dataLicense?: string;
  endpoint?: string;
  notes?: string;
  now?: string;
}) {
  assertSupportedIntegrationKind(kind);
  const normalizedTenantSlug = tenantSlug ? normalizeSlug(tenantSlug) : "";
  assertNoRawSecret({ kind, name, provider, status, validationStatus, tenantSlug, secretRef, dataLicense, endpoint, notes });
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  if (normalizedTenantSlug && !config.tenants.some((tenant: any) => tenant.slug === normalizedTenantSlug)) {
    throw new Error(`Unknown tenant ${normalizedTenantSlug}.`);
  }
  if (secretRef && !config.secret_refs.some((secret: any) => secret.secret_ref === secretRef || secret.name === secretRef)) {
    throw new Error(`Unknown secret reference ${secretRef}.`);
  }
  const integration = {
    id: makeId("integration", { kind, name, provider, tenantSlug: normalizedTenantSlug, status, endpoint }),
    kind,
    name,
    provider,
    status,
    validation_status: validationStatus,
    tenant_slug: normalizedTenantSlug,
    secret_ref: secretRef,
    data_license: dataLicense,
    endpoint,
    notes,
    created_at: now,
    raw_secret_stored: false
  };
  const saved = await saveManagedSaasConfig(rootDir, {
    ...config,
    integrations: [
      ...config.integrations.filter((item: any) => item.id !== integration.id),
      integration
    ],
    identity: {
      ...config.identity,
      configured_provider_count: kind === "identity_provider"
        ? config.integrations.filter((item: any) => item.kind === "identity_provider").length + 1
        : config.identity.configured_provider_count
    }
  }, configPath);
  return {
    integration,
    integration_count: saved.integrations.length,
    config_path: configPath
  };
}

export async function recordObservabilityEvent({
  rootDir = "managed-saas",
  tenantSlug = "",
  eventType,
  severity = "info",
  message = "",
  metadata = {},
  now = isoNow()
}: {
  rootDir?: string;
  tenantSlug?: string;
  eventType: string;
  severity?: string;
  message?: string;
  metadata?: Record<string, any>;
  now?: string;
}) {
  if (tenantSlug) normalizeSlug(tenantSlug);
  assertNoRawSecret(metadata);
  const event = {
    id: makeId("obs", { tenantSlug, eventType, severity, message, metadata, now }),
    tenant_slug: tenantSlug,
    event_type: eventType,
    severity,
    message,
    metadata,
    created_at: now
  };
  await mkdir(rootDir, { recursive: true });
  await appendFile(observabilityPath(rootDir), `${JSON.stringify(event)}\n`);
  return {
    event,
    observability_path: observabilityPath(rootDir)
  };
}

export async function readObservabilityEvents(rootDir = "managed-saas") {
  return parseJsonLines(await readTextIfExists(observabilityPath(rootDir)));
}

export async function observabilitySummary(rootDir = "managed-saas") {
  const events = await readObservabilityEvents(rootDir);
  const bySeverity: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const byTenant: Record<string, number> = {};
  for (const event of events) {
    bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
    byType[event.event_type] = (byType[event.event_type] ?? 0) + 1;
    byTenant[event.tenant_slug || "platform"] = (byTenant[event.tenant_slug || "platform"] ?? 0) + 1;
  }
  return {
    root_dir: rootDir,
    event_count: events.length,
    by_severity: bySeverity,
    by_type: byType,
    by_tenant: byTenant,
    latest: events.slice(-8).reverse()
  };
}

function control(id: string, passed: boolean, detail: string, severity = "required") {
  return { id, passed, detail, severity };
}

function integrationsByKind(config: any, kind: string) {
  return config.integrations.filter((item: any) => item.kind === kind);
}

function hasIntegrationKind(config: any, kind: string) {
  return integrationsByKind(config, kind).length > 0;
}

function integrationKinds(config: any) {
  return Object.fromEntries(SUPPORTED_INTEGRATION_KINDS.map((kind) => [
    kind,
    integrationsByKind(config, kind).length
  ]));
}

function requiredIntegrationManifestControls(config: any) {
  return REQUIRED_INTEGRATION_KINDS.map((kind) =>
    control(`${kind}_manifest`, hasIntegrationKind(config, kind), REQUIRED_INTEGRATION_LABELS[kind])
  );
}

function tenantPathsAreIsolated(config: any) {
  return config.tenants.every((tenant: any) => {
    try {
      assertInsideRoot(config.root_dir, tenant.audit_dir);
      return tenant.audit_dir.includes(`${path.sep}tenants${path.sep}${tenant.slug}${path.sep}audits`);
    } catch {
      return false;
    }
  });
}

function noRawSecrets(config: any) {
  return [...config.secret_refs, ...config.integrations].every((item: any) => item.raw_secret_stored === false);
}

export async function managedSaasReadiness({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  now?: string;
} = {}) {
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const observability = await observabilitySummary(rootDir);
  const controls = [
    control("tenant_isolation", config.tenancy.path_traversal_protection === true && tenantPathsAreIsolated(config), "Tenant audit dirs stay inside the managed SaaS root."),
    control("tenant_count", config.tenants.length > 0, "At least one tenant workspace exists."),
    control("cross_tenant_queries_disabled", config.tenancy.cross_tenant_queries_allowed === false, "Cross-tenant queries are disabled by default."),
    control("secret_refs_only", config.secrets.raw_secret_storage_allowed === false && config.secret_refs.length > 0 && noRawSecrets(config), "Only external secret references are stored."),
    ...requiredIntegrationManifestControls(config),
    control("observability_enabled", observability.event_count > 0 && hasIntegrationKind(config, "observability"), "Observability manifest and events exist."),
    control("production_execution_locked", integrationsByKind(config, "regulated_partner").every((item: any) => item.status !== "enabled_production"), "Regulated partner production integration is not enabled by manifest."),
    control("external_integrations_not_validated", config.integrations.some((item: any) => item.validation_status !== "production_validated"), "External integrations are visible but not treated as production validated.", "warning")
  ];
  const requiredFailed = controls.filter((item) => item.severity === "required" && !item.passed);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    status: requiredFailed.length === 0 ? "ready_for_managed_beta_scaffold" : "blocked",
    root_dir: rootDir,
    config_path: configPath,
    summary: {
      tenant_count: config.tenants.length,
      secret_ref_count: config.secret_refs.length,
      integration_count: config.integrations.length,
      observability_event_count: observability.event_count,
      required_failed_count: requiredFailed.length,
      integration_kinds: integrationKinds(config)
    },
    controls,
    tenants: config.tenants,
    secret_refs: config.secret_refs.map((secret: any) => ({
      id: secret.id,
      name: secret.name,
      provider: secret.provider,
      scope: secret.scope,
      secret_ref_hash: secret.secret_ref_hash,
      raw_secret_stored: false,
      rotation_days: secret.rotation_days
    })),
    integrations: config.integrations,
    observability
  };
}

export async function managedSaasStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  now?: string;
} = {}) {
  const readiness = await managedSaasReadiness({ rootDir, configPath, now });
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  return {
    schema_version: "0.1.0",
    generated_at: now,
    readiness,
    control_plane_id: config.control_plane_id,
    environment: config.environment,
    tenancy: config.tenancy,
    production_boundaries: config.production_boundaries
  };
}

export async function exportManagedSaasPackage({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  out
}: {
  rootDir?: string;
  configPath?: string;
  out: string;
}) {
  const status = await managedSaasStatus({ rootDir, configPath });
  const body = {
    schema_version: "0.1.0",
    exported_at: isoNow(),
    status,
    config: await loadManagedSaasConfig({ rootDir, configPath }),
    observability: await observabilitySummary(rootDir)
  };
  await writeJson(out, body);
  return {
    out,
    readiness_status: status.readiness.status,
    tenant_count: status.readiness.summary.tenant_count,
    secret_ref_count: status.readiness.summary.secret_ref_count,
    integration_count: status.readiness.summary.integration_count,
    observability_event_count: status.readiness.summary.observability_event_count
  };
}
