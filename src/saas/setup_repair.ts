import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId } from "../core/ids.js";
import { PERSONAS } from "../council/personas.js";
import {
  createManagedTenant,
  loadManagedSaasConfig,
  managedSaasConfigPath,
  managedSaasStatus,
  recordObservabilityEvent,
  registerExternalIntegration,
  registerSecretReference
} from "./managed.js";
import { providerValidationPath, validateProviderContracts } from "../providers/validation.js";
import { tenantPersistenceStatus } from "./persistence.js";
import {
  identityStatus,
  initializeIdentityDirectory,
  registerIdentityPrincipal
} from "./identity.js";
import {
  createStorageCheckpoint,
  durableStorageStatus,
  initializeDurableStorage,
  writeDurableObject
} from "./storage.js";
import {
  dataVendorStatus,
  importDataVendorPack,
  registerDataVendorAdapter
} from "./data_vendor.js";
import {
  llmProviderStatus,
  registerLLMProviderAdapter,
  runLLMProviderReplayAnalysis
} from "./llm_provider.js";

export const SETUP_REPAIR_EVENTS_FILE = "setup-repair-events.jsonl";

const DEFAULT_TENANT = "alpha";
const DEFAULT_SYMBOL = "NVDA";
const DEFAULT_PERSONAS = [
  "quant_researcher",
  "data_quality_officer",
  "model_validator",
  "red_team_skeptic"
].filter((persona) => PERSONAS.includes(persona as any));

function eventsPath(rootDir = "managed-saas") {
  return path.join(rootDir, SETUP_REPAIR_EVENTS_FILE);
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

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "password", "secret://"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive setup repair payload field is not allowed: ${forbidden}`);
    }
  }
}

async function appendRepairEvent({
  rootDir,
  actionId,
  status,
  tenantSlug,
  symbol,
  actor = "setup_repair",
  now
}: {
  rootDir: string;
  actionId: string;
  status: string;
  tenantSlug: string;
  symbol: string;
  actor?: string;
  now: string;
}) {
  const event = {
    id: makeId("setup_repair_evt", { rootDir, actionId, status, tenantSlug, symbol, actor, now }),
    event_type: "connector_setup_repair_applied",
    action_id: actionId,
    status,
    tenant_slug: tenantSlug,
    symbol,
    actor,
    created_at: now
  };
  assertNoSensitivePayload(event);
  await mkdir(rootDir, { recursive: true });
  await appendFile(eventsPath(rootDir), `${JSON.stringify(event)}\n`);
  return event;
}

function normalizeTenant(tenantSlug = DEFAULT_TENANT) {
  return String(tenantSlug || DEFAULT_TENANT).trim().toLowerCase();
}

function normalizeSymbol(symbol = DEFAULT_SYMBOL) {
  return String(symbol || DEFAULT_SYMBOL).trim().toUpperCase();
}

function isoDateFrom(base: string, offsetDays: number) {
  const date = new Date(`${base}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date.toISOString().slice(0, 10);
}

function makeCandles({ now, days = 28, basePrice = 100, drift = 0.004, volume = 7_500_000 }: {
  now: string;
  days?: number;
  basePrice?: number;
  drift?: number;
  volume?: number;
}) {
  const endDate = isoDateFrom(now.slice(0, 10), -1);
  const startDate = isoDateFrom(endDate, -(days - 1));
  let close = basePrice;
  return Array.from({ length: days }, (_item, index) => {
    const open = close;
    close = Math.max(1, close * (1 + drift));
    return {
      date: isoDateFrom(startDate, index),
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) * 1.01).toFixed(2)),
      low: Number((Math.min(open, close) * 0.99).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round(volume * (1 + (index % 5) * 0.018))
    };
  });
}

function vendorPayload(symbol: string, now: string) {
  return {
    provider: "guided_repair_local_vendor",
    license: "licensed_for_internal_research",
    market: makeCandles({ now }),
    events: [],
    actions: [],
    portfolio: {
      account_id: "guided_repair_portfolio",
      as_of: now,
      cash: 100000,
      total_equity: 100000,
      positions: [],
      constraints: {
        max_single_name_pct: 0.12,
        max_sector_pct: 0.35,
        max_gross_exposure_pct: 1,
        paper_risk_budget_pct: 0.02
      },
      restricted_symbols: []
    },
    sources: {
      [`market:${symbol}`]: {
        source: "guided-repair:synthetic-local-market",
        license: "licensed_for_internal_research"
      },
      "portfolio:default": {
        source: "guided-repair:synthetic-local-portfolio",
        license: "internal"
      }
    }
  };
}

function failedControlIds(status: any) {
  return (status.controls ?? [])
    .filter((control: any) => control.severity === "required" && control.passed !== true)
    .map((control: any) => control.id);
}

function localHostedApiStatus({
  rootDir,
  configPath,
  apiTokenHash,
  providerStatus,
  persistence,
  now
}: {
  rootDir: string;
  configPath: string;
  apiTokenHash: string;
  providerStatus: string;
  persistence: any;
  now: string;
}) {
  const controls = [
    {
      id: "api_auth_configured",
      passed: Boolean(apiTokenHash),
      severity: "required",
      detail: "Hosted API bearer auth token hash is configured at runtime."
    },
    {
      id: "provider_contracts_ready",
      passed: providerStatus === "ready_for_provider_contract_beta",
      severity: "required",
      detail: "Provider contract validation passed."
    },
    {
      id: "tenant_persistence_ready",
      passed: persistence.status === "ready_for_tenant_persistence",
      severity: "required",
      detail: "Tenant persistence paths are isolated and readable."
    },
    {
      id: "tenant_count",
      passed: persistence.summary.tenant_count > 0,
      severity: "required",
      detail: "At least one tenant exists."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    status: requiredFailures.length === 0 ? "ready_for_hosted_multi_tenant_api" : "blocked",
    controls
  };
}

function localFoundationStatus({
  rootDir,
  configPath,
  hosted,
  identity,
  storage,
  now
}: {
  rootDir: string;
  configPath: string;
  hosted: any;
  identity: any;
  storage: any;
  now: string;
}) {
  const controls = [
    {
      id: "hosted_api_ready",
      passed: hosted.status === "ready_for_hosted_multi_tenant_api",
      severity: "required",
      detail: "Hosted API readiness passed."
    },
    {
      id: "identity_foundation_ready",
      passed: identity.status === "ready_for_identity_foundation",
      severity: "required",
      detail: "Identity directory, principal memberships, and hash-only sessions are ready."
    },
    {
      id: "durable_storage_ready",
      passed: storage.status === "ready_for_durable_storage_foundation",
      severity: "required",
      detail: "Durable storage manifest, tenant object paths, and checkpoint evidence are ready."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    status: requiredFailures.length === 0 ? "ready_for_identity_storage_foundation" : "blocked",
    controls
  };
}

function action({
  id,
  label,
  boundary,
  detail,
  complete,
  blocked = false,
  blockReason = "",
  command
}: {
  id: string;
  label: string;
  boundary: string;
  detail: string;
  complete: boolean;
  blocked?: boolean;
  blockReason?: string;
  command: string;
}) {
  const status = complete ? "complete" : blocked ? "blocked" : "needed";
  return {
    id,
    label,
    boundary,
    detail,
    status,
    can_apply: status === "needed",
    block_reason: status === "blocked" ? blockReason : "",
    command,
    raw_secret_stored: false,
    direct_external_network_connection: false
  };
}

function primaryTenant(config: any, preferred: string) {
  return config.tenants.some((tenant: any) => tenant.slug === preferred)
    ? preferred
    : config.tenants[0]?.slug ?? preferred;
}

async function ensureControlPlaneScaffold({
  rootDir,
  configPath,
  tenantSlug,
  now
}: {
  rootDir: string;
  configPath: string;
  tenantSlug: string;
  now: string;
}) {
  await mkdir(rootDir, { recursive: true });
  let config = await loadManagedSaasConfig({ rootDir, configPath });
  if (!config.tenants.some((tenant: any) => tenant.slug === tenantSlug)) {
    await createManagedTenant({
      rootDir,
      configPath,
      slug: tenantSlug,
      name: `${tenantSlug.toUpperCase()} Research`,
      owner: "Guided Repair",
      now
    });
  }
  for (const [name, scope] of [
    ["IDENTITY_PROVIDER", "identity_provider"],
    ["MARKET_DATA_VENDOR", "market_data_vendor"],
    ["LLM_PROVIDER", "llm_provider"],
    ["REGULATED_PARTNER", "regulated_partner"],
    ["OBSERVABILITY_VENDOR", "observability"]
  ]) {
    config = await loadManagedSaasConfig({ rootDir, configPath });
    if (!config.secret_refs.some((secret: any) => secret.name === name)) {
      await registerSecretReference({
        rootDir,
        configPath,
        name,
        scope,
        secretRef: `secret://guided-repair/${name.toLowerCase()}`,
        now
      });
    }
  }
  const integrations = [
    {
      kind: "identity_provider",
      name: "Guided Repair OIDC Contract",
      provider: "guided_repair_oidc",
      secretRef: "IDENTITY_PROVIDER",
      endpoint: "https://idp.example.invalid/oauth2",
      notes: "Local setup contract. Production SSO remains disabled until configured."
    },
    {
      kind: "market_data_vendor",
      name: "Guided Repair Market Data Contract",
      provider: "guided_repair_market_data",
      tenantSlug,
      secretRef: "MARKET_DATA_VENDOR",
      dataLicense: "licensed_for_internal_research",
      notes: "Local replay data contract. Live vendor network remains disabled."
    },
    {
      kind: "llm_provider",
      name: "Guided Repair Model Gateway Contract",
      provider: "guided_repair_model_gateway",
      secretRef: "LLM_PROVIDER",
      notes: "Local replay model contract. Live model network remains disabled."
    },
    {
      kind: "regulated_partner",
      name: "Guided Repair Regulated Partner Contract",
      provider: "guided_repair_partner",
      secretRef: "REGULATED_PARTNER",
      status: "disabled_until_legal_approval",
      notes: "Production execution remains locked."
    },
    {
      kind: "observability",
      name: "Guided Repair Observability Contract",
      provider: "guided_repair_logs",
      secretRef: "OBSERVABILITY_VENDOR",
      notes: "Local event capture only."
    }
  ];
  for (const integration of integrations) {
    config = await loadManagedSaasConfig({ rootDir, configPath });
    const exists = config.integrations.some((item: any) =>
      item.kind === integration.kind &&
      (integration.tenantSlug ? item.tenant_slug === integration.tenantSlug : true)
    );
    if (!exists) {
      await registerExternalIntegration({
        rootDir,
        configPath,
        status: integration.status ?? "disabled_until_configured",
        validationStatus: "not_validated",
        now,
        ...integration
      });
    }
  }
  await recordObservabilityEvent({
    rootDir,
    tenantSlug,
    eventType: "guided_repair_control_plane_scaffolded",
    severity: "info",
    message: "Guided repair scaffolded local provider contracts.",
    metadata: { phase: 16 },
    now
  });
}

async function ensureIdentity({
  rootDir,
  configPath,
  tenantSlug,
  now
}: {
  rootDir: string;
  configPath: string;
  tenantSlug: string;
  now: string;
}) {
  const before = await identityStatus({ rootDir, configPath, now });
  if (before.summary.principal_count === 0 && before.summary.event_count === 0) {
    await initializeIdentityDirectory({ rootDir, now });
  }
  const current = await identityStatus({ rootDir, configPath, now });
  if (!current.principals.some((principal: any) =>
    principal.email === "guided.repair.analyst@example.com" ||
    (principal.memberships ?? []).some((membership: any) => membership.tenant_slug === tenantSlug)
  )) {
    await registerIdentityPrincipal({
      rootDir,
      configPath,
      email: "guided.repair.analyst@example.com",
      name: "Guided Repair Analyst",
      tenantSlug,
      role: "tenant_admin",
      actor: "setup_repair",
      now
    });
  }
}

async function ensureStorage({
  rootDir,
  configPath,
  tenantSlug,
  symbol,
  now
}: {
  rootDir: string;
  configPath: string;
  tenantSlug: string;
  symbol: string;
  now: string;
}) {
  const before = await durableStorageStatus({ rootDir, configPath, now });
  if (before.summary.object_count === 0 && before.summary.checkpoint_count === 0 && before.summary.event_count === 0) {
    await initializeDurableStorage({
      rootDir,
      configPath,
      provider: "guided_repair_local_durable_storage",
      now
    });
  }
  await writeDurableObject({
    rootDir,
    configPath,
    tenantSlug,
    key: "guided_repair.seed",
    value: {
      symbols: [symbol],
      mode: "research_console_repair"
    },
    actor: "setup_repair",
    now
  });
  await createStorageCheckpoint({
    rootDir,
    configPath,
    tenantSlug,
    label: "guided-repair",
    actor: "setup_repair",
    now
  });
}

async function ensureDataVendor({
  rootDir,
  configPath,
  tenantSlug,
  symbol,
  now
}: {
  rootDir: string;
  configPath: string;
  tenantSlug: string;
  symbol: string;
  now: string;
}) {
  const status = await dataVendorStatus({ rootDir, configPath, tenantSlug, now });
  if (!status.adapters.some((adapter: any) => adapter.adapter_id === "guided-local")) {
    await registerDataVendorAdapter({
      rootDir,
      configPath,
      tenantSlug,
      adapterId: "guided-local",
      name: "Guided Local Vendor",
      provider: "guided_repair_market_data",
      secretRef: "MARKET_DATA_VENDOR",
      dataLicense: "licensed_for_internal_research",
      allowedSymbols: [symbol],
      actor: "setup_repair",
      now
    });
  }
  const afterAdapter = await dataVendorStatus({ rootDir, configPath, tenantSlug, now });
  if (!afterAdapter.imports.some((item: any) => item.adapter_id === "guided-local" && item.symbol === symbol)) {
    await importDataVendorPack({
      rootDir,
      configPath,
      tenantSlug,
      adapterId: "guided-local",
      symbol,
      payload: vendorPayload(symbol, now),
      actor: "setup_repair",
      now
    });
  }
}

async function ensureLLMProvider({
  rootDir,
  configPath,
  tenantSlug,
  symbol,
  now
}: {
  rootDir: string;
  configPath: string;
  tenantSlug: string;
  symbol: string;
  now: string;
}) {
  const status = await llmProviderStatus({ rootDir, configPath, tenantSlug, now });
  if (!status.adapters.some((adapter: any) => adapter.adapter_id === "guided-model")) {
    await registerLLMProviderAdapter({
      rootDir,
      configPath,
      tenantSlug,
      adapterId: "guided-model",
      name: "Guided Model Replay",
      provider: "guided_repair_model_gateway",
      secretRef: "LLM_PROVIDER",
      modelRegistryRef: "guided_repair_replay_v0",
      allowedPersonas: DEFAULT_PERSONAS,
      actor: "setup_repair",
      now
    });
  }
  const afterAdapter = await llmProviderStatus({ rootDir, configPath, tenantSlug, now });
  if (!afterAdapter.runs.some((run: any) => run.adapter_id === "guided-model" && run.symbol === symbol)) {
    const dataStatus = await dataVendorStatus({ rootDir, configPath, tenantSlug, now });
    const importRecord = dataStatus.imports.find((item: any) => item.symbol === symbol);
    await runLLMProviderReplayAnalysis({
      rootDir,
      configPath,
      tenantSlug,
      adapterId: "guided-model",
      symbol,
      thesis: "guided repair replay verifies the model boundary with evidence-only context",
      dataDir: importRecord?.data_dir ?? "fixtures",
      actionCeiling: "watchlist",
      audit: true,
      actor: "setup_repair",
      now
    });
  }
}

export async function connectorRepairStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  apiTokenHash = "",
  tenantSlug = DEFAULT_TENANT,
  symbol = DEFAULT_SYMBOL,
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  apiTokenHash?: string;
  tenantSlug?: string;
  symbol?: string;
  now?: string;
} = {}) {
  const tenant = normalizeTenant(tenantSlug);
  const ticker = normalizeSymbol(symbol);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const selectedTenant = primaryTenant(config, tenant);
  const managed = await managedSaasStatus({ rootDir, configPath, now });
  const providers = await validateProviderContracts({
    rootDir,
    configPath,
    out: providerValidationPath(rootDir),
    now
  });
  const persistence = await tenantPersistenceStatus({ rootDir, configPath, now });
  const identity = await identityStatus({ rootDir, configPath, now });
  const storage = await durableStorageStatus({ rootDir, configPath, now });
  const hosted = localHostedApiStatus({
    rootDir,
    configPath,
    apiTokenHash,
    providerStatus: providers.status,
    persistence,
    now
  });
  const foundation = localFoundationStatus({
    rootDir,
    configPath,
    hosted,
    identity,
    storage,
    now
  });
  const dataVendor = await dataVendorStatus({
    rootDir,
    configPath,
    tenantSlug: selectedTenant,
    now
  });
  const llmProvider = await llmProviderStatus({
    rootDir,
    configPath,
    tenantSlug: selectedTenant,
    now
  });
  const providerReady = providers.status === "ready_for_provider_contract_beta";
  const tenantExists = persistence.tenants.some((item: any) => item.tenant_slug === selectedTenant);
  const events = parseJsonLines(await readTextIfExists(eventsPath(rootDir)));
  const actions = [
    action({
      id: "control_plane_scaffold",
      label: "Scaffold control plane contracts",
      boundary: "control_plane",
      detail: "Create a tenant, secret-reference names, provider manifests, and one local observability event.",
      complete: managed.readiness.status === "ready_for_managed_beta_scaffold" && providerReady,
      command: `setup-repair-apply --root-dir ${rootDir} --action control_plane_scaffold --tenant ${tenant}`
    }),
    action({
      id: "identity_bootstrap",
      label: "Bootstrap identity directory",
      boundary: "identity",
      detail: "Initialize hash-only identity state and add a tenant-scoped analyst principal.",
      complete: identity.status === "ready_for_identity_foundation",
      blocked: !providerReady || !tenantExists,
      blockReason: !tenantExists ? "A tenant must exist first." : "Provider contracts must validate first.",
      command: `setup-repair-apply --root-dir ${rootDir} --action identity_bootstrap --tenant ${selectedTenant}`
    }),
    action({
      id: "storage_bootstrap",
      label: "Bootstrap durable storage",
      boundary: "storage",
      detail: "Create local durable storage, write a tenant seed object, and capture a checkpoint.",
      complete: storage.status === "ready_for_durable_storage_foundation",
      blocked: !tenantExists,
      blockReason: "A tenant must exist first.",
      command: `setup-repair-apply --root-dir ${rootDir} --action storage_bootstrap --tenant ${selectedTenant}`
    }),
    action({
      id: "data_vendor_bootstrap",
      label: "Bootstrap data vendor replay",
      boundary: "data_vendor",
      detail: "Register a tenant-scoped local vendor adapter and import a licensed synthetic data pack.",
      complete: dataVendor.status === "ready_for_external_data_vendor_boundary",
      blocked: !providerReady || !tenantExists,
      blockReason: !tenantExists ? "A tenant must exist first." : "Market-data provider contract must validate first.",
      command: `setup-repair-apply --root-dir ${rootDir} --action data_vendor_bootstrap --tenant ${selectedTenant} --symbol ${ticker}`
    }),
    action({
      id: "llm_provider_bootstrap",
      label: "Bootstrap LLM replay provider",
      boundary: "llm_provider",
      detail: "Register a replay model adapter, run evals, and record one evidence-only replay analysis.",
      complete: llmProvider.status === "ready_for_external_llm_provider_boundary",
      blocked: !providerReady || dataVendor.status !== "ready_for_external_data_vendor_boundary" || !tenantExists,
      blockReason: !tenantExists
        ? "A tenant must exist first."
        : dataVendor.status !== "ready_for_external_data_vendor_boundary"
          ? "Data vendor replay must be ready first."
          : "LLM provider contract must validate first.",
      command: `setup-repair-apply --root-dir ${rootDir} --action llm_provider_bootstrap --tenant ${selectedTenant} --symbol ${ticker}`
    })
  ];
  const nextAction = actions.find((item) => item.can_apply) ?? null;
  const ready = actions.every((item) => item.status === "complete");
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    events_path: eventsPath(rootDir),
    status: ready ? "ready_for_guided_connector_setup" : "blocked",
    summary: {
      action_count: actions.length,
      complete_count: actions.filter((item) => item.status === "complete").length,
      needed_count: actions.filter((item) => item.status === "needed").length,
      blocked_count: actions.filter((item) => item.status === "blocked").length,
      event_count: events.length,
      tenant_slug: selectedTenant,
      symbol: ticker,
      raw_secret_stored: false,
      direct_external_network_connection: false
    },
    statuses: {
      managed_saas: managed.readiness.status,
      provider_validation: providers.status,
      tenant_persistence: persistence.status,
      hosted_api: hosted.status,
      foundation: foundation.status,
      identity: identity.status,
      storage: storage.status,
      data_vendor: dataVendor.status,
      llm_provider: llmProvider.status
    },
    failed_controls: {
      managed_saas: failedControlIds(managed.readiness),
      provider_validation: failedControlIds(providers),
      hosted_api: failedControlIds(hosted),
      foundation: failedControlIds(foundation),
      identity: failedControlIds(identity),
      storage: failedControlIds(storage),
      data_vendor: failedControlIds(dataVendor),
      llm_provider: failedControlIds(llmProvider)
    },
    actions,
    next_action: nextAction,
    latest_events: events.slice(-8).reverse()
  };
}

export async function applyConnectorRepair({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  apiTokenHash = "",
  actionId,
  tenantSlug = DEFAULT_TENANT,
  symbol = DEFAULT_SYMBOL,
  actor = "setup_repair",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  apiTokenHash?: string;
  actionId: string;
  tenantSlug?: string;
  symbol?: string;
  actor?: string;
  now?: string;
}) {
  const before = await connectorRepairStatus({
    rootDir,
    configPath,
    apiTokenHash,
    tenantSlug,
    symbol,
    now
  });
  const selected = actionId === "next"
    ? before.next_action
    : before.actions.find((item: any) => item.id === actionId);
  if (!selected) throw new Error(`Unknown connector repair action ${actionId}.`);
  if (!selected.can_apply) {
    throw new Error(`Connector repair action ${selected.id} is ${selected.status}: ${selected.block_reason || "nothing to apply"}.`);
  }
  const tenant = normalizeTenant(tenantSlug || before.summary.tenant_slug);
  const ticker = normalizeSymbol(symbol || before.summary.symbol);
  if (selected.id === "control_plane_scaffold") {
    await ensureControlPlaneScaffold({ rootDir, configPath, tenantSlug: tenant, now });
  } else if (selected.id === "identity_bootstrap") {
    await ensureIdentity({ rootDir, configPath, tenantSlug: tenant, now });
  } else if (selected.id === "storage_bootstrap") {
    await ensureStorage({ rootDir, configPath, tenantSlug: tenant, symbol: ticker, now });
  } else if (selected.id === "data_vendor_bootstrap") {
    await ensureDataVendor({ rootDir, configPath, tenantSlug: tenant, symbol: ticker, now });
  } else if (selected.id === "llm_provider_bootstrap") {
    await ensureLLMProvider({ rootDir, configPath, tenantSlug: tenant, symbol: ticker, now });
  } else {
    throw new Error(`Unsupported connector repair action ${selected.id}.`);
  }
  const event = await appendRepairEvent({
    rootDir,
    actionId: selected.id,
    status: "applied",
    tenantSlug: tenant,
    symbol: ticker,
    actor,
    now
  });
  const after = await connectorRepairStatus({
    rootDir,
    configPath,
    apiTokenHash,
    tenantSlug: tenant,
    symbol: ticker,
    now
  });
  return {
    schema_version: "0.1.0",
    generated_at: now,
    action_id: selected.id,
    action_label: selected.label,
    status: "applied",
    root_dir: rootDir,
    config_path: configPath,
    tenant_slug: tenant,
    symbol: ticker,
    event,
    before_status: before.status,
    after_status: after.status,
    next_action: after.next_action,
    summary: after.summary,
    raw_secret_stored: false,
    direct_external_network_connection: false,
    repair_status: after
  };
}
