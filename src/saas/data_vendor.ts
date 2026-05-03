import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildDataStatus } from "../data/status.js";
import { loadDataManifest, readJsonIfExists } from "../data/adapters.js";
import { isoNow, makeId, stableHash } from "../core/ids.js";
import { providerValidationPath, validateProviderContracts } from "../providers/validation.js";
import { loadManagedSaasConfig, managedSaasConfigPath } from "./managed.js";
import { normalizeTenantSlug, resolveTenant } from "./persistence.js";

export const DATA_VENDOR_FILE = "data-vendor-adapters.json";
export const DATA_VENDOR_EVENTS_FILE = "data-vendor-events.jsonl";

async function readRegistryJson(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonLines(text = "") {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function registryPath(rootDir = "managed-saas") {
  return path.join(rootDir, DATA_VENDOR_FILE);
}

function eventsPath(rootDir = "managed-saas") {
  return path.join(rootDir, DATA_VENDOR_EVENTS_FILE);
}

function normalizeAdapterId(adapterId: string) {
  const normalized = String(adapterId ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,80}$/.test(normalized)) {
    throw new Error("Data vendor adapter id must be 2-81 chars and contain only lowercase letters, numbers, dot, hyphen, or underscore.");
  }
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Data vendor adapter id cannot contain path traversal characters.");
  }
  return normalized;
}

function normalizeSymbol(symbol: string) {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,16}$/.test(normalized)) {
    throw new Error("Data vendor symbol must be 1-16 uppercase letters, numbers, dot, hyphen, or underscore.");
  }
  return normalized;
}

function assertInsideRoot(rootDir: string, candidate: string) {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Resolved data vendor path escapes managed SaaS root: ${candidate}`);
  }
}

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "password", "secret://"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive data vendor payload field is not allowed: ${forbidden}`);
    }
  }
}

function assertAllowedLicense(license: string) {
  const normalized = String(license ?? "").trim().toLowerCase();
  if (!normalized || ["restricted", "unlicensed", "unknown"].includes(normalized)) {
    throw new Error(`Data vendor license is not allowed for tenant import: ${license || "missing"}.`);
  }
  return normalized;
}

function defaultRegistry(rootDir = "managed-saas", now = isoNow()) {
  return {
    schema_version: "0.1.0",
    root_dir: rootDir,
    created_at: now,
    boundary: {
      mode: "local_vendor_replay_contract",
      direct_vendor_network_connection: false,
      raw_vendor_secret_storage_allowed: false,
      tenant_scoped_data_packs_required: true,
      license_gate_required: true,
      provenance_hash_required: true
    },
    adapters: [],
    imports: []
  };
}

async function loadRegistry(rootDir = "managed-saas") {
  const registry = await readRegistryJson(registryPath(rootDir), defaultRegistry(rootDir));
  return {
    ...defaultRegistry(rootDir),
    ...registry,
    root_dir: rootDir,
    adapters: registry.adapters ?? [],
    imports: registry.imports ?? []
  };
}

async function saveRegistry(rootDir: string, registry: any) {
  const next = {
    ...registry,
    schema_version: "0.1.0",
    root_dir: rootDir,
    updated_at: isoNow()
  };
  await writeJson(registryPath(rootDir), next);
  return next;
}

async function appendVendorEvent({
  rootDir = "managed-saas",
  eventType,
  actor = "data_vendor_boundary",
  payload = {},
  now = isoNow()
}: {
  rootDir?: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, any>;
  now?: string;
}) {
  assertNoSensitivePayload(payload);
  const event = {
    id: makeId("data_vendor_evt", { rootDir, eventType, actor, payload, now }),
    event_type: eventType,
    actor,
    payload,
    created_at: now
  };
  await mkdir(rootDir, { recursive: true });
  await appendFile(eventsPath(rootDir), `${JSON.stringify(event)}\n`);
  return event;
}

function toCsv(candles: any[]) {
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

async function readJsonOptional(filePath: string, fallback: any) {
  return readJsonIfExists(filePath, fallback);
}

async function readSourcePayload(sourceDataDir: string, symbol: string) {
  const manifest = await loadDataManifest(sourceDataDir);
  const marketCsv = await readFile(path.join(sourceDataDir, "market", `${symbol}.csv`), "utf8");
  return {
    manifest,
    files: {
      marketCsv,
      events: await readJsonOptional(path.join(sourceDataDir, "events", `${symbol}.json`), []),
      actions: await readJsonOptional(path.join(sourceDataDir, "actions", `${symbol}.json`), []),
      fundamentals: await readJsonOptional(path.join(sourceDataDir, "fundamentals", `${symbol}.json`), undefined),
      news: await readJsonOptional(path.join(sourceDataDir, "news", `${symbol}.json`), undefined),
      portfolio: await readJsonOptional(path.join(sourceDataDir, "portfolio", "default.json"), {
        account_id: "vendor_import_default",
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
      })
    }
  };
}

function payloadFilesFromBody(payload: any, symbol: string, now: string) {
  if (!Array.isArray(payload?.market) || payload.market.length === 0) {
    throw new Error("Data vendor payload must include non-empty market candles.");
  }
  return {
    manifest: {
      provider: payload.provider ?? "external_data_vendor_payload",
      license: payload.license ?? "licensed_for_internal_research",
      sources: payload.sources ?? {}
    },
    files: {
      marketCsv: toCsv(payload.market),
      events: payload.events ?? [],
      actions: payload.actions ?? [],
      fundamentals: payload.fundamentals,
      news: payload.news,
      portfolio: payload.portfolio ?? {
        account_id: "vendor_payload_default",
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
      }
    }
  };
}

async function writeDataPack({
  dataDir,
  symbol,
  adapter,
  license,
  source,
  files,
  now
}: {
  dataDir: string;
  symbol: string;
  adapter: any;
  license: string;
  source: any;
  files: any;
  now: string;
}) {
  for (const folder of ["market", "events", "actions", "portfolio"]) {
    await mkdir(path.join(dataDir, folder), { recursive: true });
  }
  if (files.fundamentals) await mkdir(path.join(dataDir, "fundamentals"), { recursive: true });
  if (files.news) await mkdir(path.join(dataDir, "news"), { recursive: true });
  await writeFile(path.join(dataDir, "market", `${symbol}.csv`), files.marketCsv);
  await writeJson(path.join(dataDir, "events", `${symbol}.json`), files.events ?? []);
  await writeJson(path.join(dataDir, "actions", `${symbol}.json`), files.actions ?? []);
  await writeJson(path.join(dataDir, "portfolio", "default.json"), files.portfolio);
  if (files.fundamentals) await writeJson(path.join(dataDir, "fundamentals", `${symbol}.json`), files.fundamentals);
  if (files.news) await writeJson(path.join(dataDir, "news", `${symbol}.json`), files.news);

  const manifest = {
    provider: adapter.provider,
    license: "internal",
    generated_at: now,
    data_vendor: {
      adapter_id: adapter.adapter_id,
      tenant_slug: adapter.tenant_slug,
      source_provider: source.manifest?.provider ?? adapter.provider,
      source_license: source.manifest?.license ?? license,
      contract_license: license,
      direct_vendor_network_connection: false,
      raw_secret_stored: false
    },
    sources: {
      [`market:${symbol}`]: { source: `vendor:${adapter.adapter_id}:market/${symbol}.csv`, license: "internal" },
      [`events:${symbol}`]: { source: `vendor:${adapter.adapter_id}:events/${symbol}.json`, license: "internal" },
      [`actions:${symbol}`]: { source: `vendor:${adapter.adapter_id}:actions/${symbol}.json`, license: "internal" },
      "portfolio:default": { source: `vendor:${adapter.adapter_id}:portfolio/default.json`, license: "internal" },
      ...(files.fundamentals ? { [`fundamentals:${symbol}`]: { source: `vendor:${adapter.adapter_id}:fundamentals/${symbol}.json`, license: "internal" } } : {}),
      ...(files.news ? { [`news:${symbol}`]: { source: `vendor:${adapter.adapter_id}:news/${symbol}.json`, license: "internal" } } : {})
    }
  };
  await writeJson(path.join(dataDir, "manifest.json"), manifest);
  return manifest;
}

export async function registerDataVendorAdapter({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  adapterId,
  name,
  provider,
  tenantSlug,
  secretRef,
  endpoint = "",
  dataLicense,
  allowedSymbols = [],
  maxStalenessMinutes = 1440,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  adapterId: string;
  name: string;
  provider: string;
  tenantSlug: string;
  secretRef: string;
  endpoint?: string;
  dataLicense: string;
  allowedSymbols?: string[];
  maxStalenessMinutes?: number;
  actor?: string;
  now?: string;
}) {
  const adapter_id = normalizeAdapterId(adapterId);
  const tenant_slug = normalizeTenantSlug(tenantSlug);
  const license = assertAllowedLicense(dataLicense);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  if (!config.tenants.some((tenant: any) => tenant.slug === tenant_slug)) {
    throw new Error(`Unknown tenant ${tenant_slug}.`);
  }
  if (!config.secret_refs.some((secret: any) => secret.name === secretRef || secret.secret_ref === secretRef)) {
    throw new Error(`Unknown secret reference ${secretRef}.`);
  }
  assertNoSensitivePayload({ adapterId, name, provider, tenantSlug, secretRef, endpoint, dataLicense, allowedSymbols });
  const adapter = {
    id: makeId("data_vendor_adapter", { adapter_id, tenant_slug, provider, secretRef }),
    adapter_id,
    name,
    provider,
    tenant_slug,
    secret_ref_name: secretRef,
    endpoint,
    data_license: license,
    allowed_symbols: allowedSymbols.map(normalizeSymbol),
    max_staleness_minutes: maxStalenessMinutes,
    mode: "local_vendor_replay_contract",
    direct_vendor_network_connection: false,
    raw_secret_stored: false,
    created_at: now
  };
  const registry = await loadRegistry(rootDir);
  const saved = await saveRegistry(rootDir, {
    ...registry,
    adapters: [
      ...registry.adapters.filter((item: any) => !(item.adapter_id === adapter_id && item.tenant_slug === tenant_slug)),
      adapter
    ]
  });
  await appendVendorEvent({
    rootDir,
    eventType: "data_vendor_adapter_registered",
    actor,
    payload: {
      adapter_id,
      tenant_slug,
      provider,
      data_license: license
    },
    now
  });
  return {
    adapter,
    adapter_count: saved.adapters.length,
    registry_path: registryPath(rootDir)
  };
}

export async function importDataVendorPack({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  adapterId,
  tenantSlug,
  symbol,
  sourceDataDir,
  payload,
  actor = "data_vendor_import",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  adapterId: string;
  tenantSlug: string;
  symbol: string;
  sourceDataDir?: string;
  payload?: any;
  actor?: string;
  now?: string;
}) {
  const adapter_id = normalizeAdapterId(adapterId);
  const tenant_slug = normalizeTenantSlug(tenantSlug);
  const normalizedSymbol = normalizeSymbol(symbol);
  const registry = await loadRegistry(rootDir);
  const adapter = registry.adapters.find((item: any) => item.adapter_id === adapter_id && item.tenant_slug === tenant_slug);
  if (!adapter) throw new Error(`Unknown data vendor adapter ${adapter_id} for tenant ${tenant_slug}.`);
  if (adapter.allowed_symbols.length && !adapter.allowed_symbols.includes(normalizedSymbol)) {
    throw new Error(`Data vendor adapter ${adapter_id} is not approved for ${normalizedSymbol}.`);
  }
  const source = sourceDataDir
    ? await readSourcePayload(sourceDataDir, normalizedSymbol)
    : payloadFilesFromBody(payload, normalizedSymbol, now);
  assertNoSensitivePayload(source.files);
  const license = assertAllowedLicense(source.manifest?.license ?? adapter.data_license);
  const resolvedTenant = await resolveTenant({ rootDir, configPath, tenantSlug: tenant_slug });
  const dataDir = path.join(resolvedTenant.tenant_dir, "data-vendors", adapter_id, normalizedSymbol);
  assertInsideRoot(rootDir, dataDir);
  await writeDataPack({
    dataDir,
    symbol: normalizedSymbol,
    adapter,
    license,
    source,
    files: source.files,
    now
  });
  const dataStatus = await buildDataStatus({
    dataDir,
    symbol: normalizedSymbol,
    now,
    dependencies: []
  });
  const importRecord = {
    id: makeId("data_vendor_import", {
      adapter_id,
      tenant_slug,
      normalizedSymbol,
      dataDir,
      snapshotHash: dataStatus.snapshot_hash,
      now
    }),
    adapter_id,
    tenant_slug,
    symbol: normalizedSymbol,
    data_dir: dataDir,
    imported_at: now,
    imported_by: actor,
    license,
    provider: adapter.provider,
    provenance_hash: stableHash({
      adapter_id,
      tenant_slug,
      normalizedSymbol,
      data_status_hash: dataStatus.snapshot_hash,
      source_provider: source.manifest?.provider ?? adapter.provider,
      source_license: source.manifest?.license ?? license
    }),
    data_status_passed: dataStatus.passed,
    stale_item_count: dataStatus.stale_items.length,
    restricted_item_count: dataStatus.restricted_items.length,
    direct_vendor_network_connection: false,
    raw_secret_stored: false
  };
  const saved = await saveRegistry(rootDir, {
    ...registry,
    imports: [
      ...registry.imports.filter((item: any) => item.id !== importRecord.id),
      importRecord
    ]
  });
  await appendVendorEvent({
    rootDir,
    eventType: "data_vendor_pack_imported",
    actor,
    payload: {
      import_id: importRecord.id,
      adapter_id,
      tenant_slug,
      symbol: normalizedSymbol,
      data_status_passed: dataStatus.passed,
      provenance_hash: importRecord.provenance_hash
    },
    now
  });
  return {
    import: importRecord,
    data_status: dataStatus,
    import_count: saved.imports.length,
    registry_path: registryPath(rootDir)
  };
}

export async function dataVendorStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug,
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug?: string;
  now?: string;
} = {}) {
  const registry = await loadRegistry(rootDir);
  const normalizedTenant = tenantSlug ? normalizeTenantSlug(tenantSlug) : "";
  const adapters = normalizedTenant
    ? registry.adapters.filter((adapter: any) => adapter.tenant_slug === normalizedTenant)
    : registry.adapters;
  const imports = normalizedTenant
    ? registry.imports.filter((item: any) => item.tenant_slug === normalizedTenant)
    : registry.imports;
  const providerValidation = await validateProviderContracts({
    rootDir,
    configPath,
    out: providerValidationPath(rootDir),
    now
  });
  const marketProviderReady = providerValidation.providers.some((provider: any) =>
    provider.kind === "market_data_vendor" && provider.status === "contract_validated"
  );
  const pathsIsolated = imports.every((item: any) => {
    try {
      assertInsideRoot(rootDir, item.data_dir);
      return item.data_dir.includes(`${path.sep}tenants${path.sep}${item.tenant_slug}${path.sep}data-vendors${path.sep}`);
    } catch {
      return false;
    }
  });
  const licensesAllowed = [...adapters, ...imports].every((item: any) =>
    Boolean(item.data_license ?? item.license) &&
    !["restricted", "unlicensed", "unknown"].includes(String(item.data_license ?? item.license).toLowerCase())
  );
  const controls = [
    {
      id: "market_data_provider_contract_ready",
      passed: marketProviderReady,
      severity: "required",
      detail: "Managed market-data provider contract is validated."
    },
    {
      id: "adapter_registered",
      passed: adapters.length > 0,
      severity: "required",
      detail: "At least one tenant-scoped data vendor adapter is registered."
    },
    {
      id: "vendor_pack_imported",
      passed: imports.length > 0,
      severity: "required",
      detail: "At least one tenant-scoped vendor data pack has been imported."
    },
    {
      id: "data_status_passed",
      passed: imports.length > 0 && imports.every((item: any) => item.data_status_passed === true),
      severity: "required",
      detail: "Imported vendor packs pass freshness and license checks."
    },
    {
      id: "licenses_allowed",
      passed: licensesAllowed,
      severity: "required",
      detail: "Vendor adapter and import licenses are declared and not restricted."
    },
    {
      id: "tenant_data_paths_isolated",
      passed: pathsIsolated,
      severity: "required",
      detail: "Vendor data packs are stored under tenant-scoped data-vendor prefixes."
    },
    {
      id: "no_raw_vendor_secrets",
      passed: adapters.every((adapter: any) => adapter.raw_secret_stored === false) &&
        imports.every((item: any) => item.raw_secret_stored === false),
      severity: "required",
      detail: "Vendor registry stores secret reference names and hashes only."
    },
    {
      id: "direct_vendor_network_disabled",
      passed: adapters.every((adapter: any) => adapter.direct_vendor_network_connection === false) &&
        imports.every((item: any) => item.direct_vendor_network_connection === false),
      severity: "required",
      detail: "Phase 13 uses local replay contracts, not live vendor networking."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  const allEvents = parseJsonLines(await readTextIfExists(eventsPath(rootDir)));
  const events = normalizedTenant
    ? allEvents.filter((event: any) => event.payload?.tenant_slug === normalizedTenant)
    : allEvents;
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    registry_path: registryPath(rootDir),
    events_path: eventsPath(rootDir),
    status: requiredFailures.length === 0 ? "ready_for_external_data_vendor_boundary" : "blocked",
    summary: {
      adapter_count: adapters.length,
      import_count: imports.length,
      event_count: events.length,
      required_failure_count: requiredFailures.length,
      data_status_failed_count: imports.filter((item: any) => item.data_status_passed !== true).length,
      raw_secret_stored: false,
      direct_vendor_network_connection: false
    },
    controls,
    adapters,
    imports,
    latest_events: events.slice(-8).reverse(),
    provider_validation: providerValidation
  };
}
