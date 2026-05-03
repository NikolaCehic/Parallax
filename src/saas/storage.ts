import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId, stableHash } from "../core/ids.js";
import { loadManagedSaasConfig, managedSaasConfigPath } from "./managed.js";
import { normalizeTenantSlug, resolveTenant, tenantPersistenceStatus } from "./persistence.js";

export const DURABLE_STORAGE_FILE = "durable-storage.json";
export const DURABLE_STORAGE_EVENTS_FILE = "durable-storage-events.jsonl";

async function readJsonIfExists(filePath: string, fallback: any) {
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

function durableStoragePath(rootDir = "managed-saas") {
  return path.join(rootDir, DURABLE_STORAGE_FILE);
}

function durableStorageEventsPath(rootDir = "managed-saas") {
  return path.join(rootDir, DURABLE_STORAGE_EVENTS_FILE);
}

function defaultStorageRoot(rootDir = "managed-saas") {
  return path.join(rootDir, "durable-storage");
}

function assertInsideRoot(rootDir: string, candidate: string) {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Resolved durable storage path escapes managed SaaS root: ${candidate}`);
  }
}

function safeObjectKey(key: string) {
  const normalized = String(key ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,100}$/.test(normalized)) {
    throw new Error("Storage object key must be 2-101 chars and contain only lowercase letters, numbers, dot, hyphen, or underscore.");
  }
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("Storage object key cannot contain path traversal characters.");
  }
  return normalized;
}

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "password", "secret://"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive storage payload field is not allowed: ${forbidden}`);
    }
  }
}

function defaultStorage({
  rootDir = "managed-saas",
  storageRoot = defaultStorageRoot(rootDir),
  provider = "local_durable_storage",
  region = "local_dev",
  now = isoNow()
}: {
  rootDir?: string;
  storageRoot?: string;
  provider?: string;
  region?: string;
  now?: string;
} = {}) {
  return {
    schema_version: "0.1.0",
    root_dir: rootDir,
    storage_root: storageRoot,
    provider,
    region,
    created_at: now,
    durability_model: {
      mode: "local_durable_storage_contract",
      tenant_prefix_required: true,
      checkpoint_required: true,
      backup_retention_days: 30,
      encryption_at_rest: "local_dev_envelope_placeholder",
      raw_secret_storage_allowed: false,
      direct_cloud_storage_connection: false
    },
    objects: [],
    checkpoints: []
  };
}

async function loadDurableStorageConfig({
  rootDir = "managed-saas",
  storagePath = durableStoragePath(rootDir)
}: {
  rootDir?: string;
  storagePath?: string;
} = {}) {
  const config = await readJsonIfExists(storagePath, defaultStorage({ rootDir }));
  return {
    ...defaultStorage({ rootDir }),
    ...config,
    root_dir: rootDir,
    objects: config.objects ?? [],
    checkpoints: config.checkpoints ?? []
  };
}

async function saveDurableStorageConfig(rootDir: string, config: any, storagePath = durableStoragePath(rootDir)) {
  assertInsideRoot(rootDir, config.storage_root);
  const next = {
    ...config,
    schema_version: "0.1.0",
    root_dir: rootDir,
    updated_at: isoNow()
  };
  await writeJson(storagePath, next);
  return next;
}

async function appendStorageEvent({
  rootDir = "managed-saas",
  eventType,
  actor = "storage_system",
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
    id: makeId("storage_evt", { rootDir, eventType, actor, payload, now }),
    event_type: eventType,
    actor,
    payload,
    created_at: now
  };
  await mkdir(rootDir, { recursive: true });
  await appendFile(durableStorageEventsPath(rootDir), `${JSON.stringify(event)}\n`);
  return event;
}

function objectPath(storageRoot: string, tenantSlug: string, key: string) {
  return path.join(storageRoot, "tenants", tenantSlug, "objects", `${key}.json`);
}

export async function initializeDurableStorage({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  storagePath = durableStoragePath(rootDir),
  storageRoot = defaultStorageRoot(rootDir),
  provider = "local_durable_storage",
  region = "local_dev",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  storagePath?: string;
  storageRoot?: string;
  provider?: string;
  region?: string;
  now?: string;
} = {}) {
  await loadManagedSaasConfig({ rootDir, configPath });
  assertInsideRoot(rootDir, storageRoot);
  await mkdir(storageRoot, { recursive: true });
  const config = defaultStorage({ rootDir, storageRoot, provider, region, now });
  await writeJson(storagePath, config);
  await appendStorageEvent({
    rootDir,
    eventType: "durable_storage_initialized",
    actor: "platform",
    payload: { provider, region },
    now
  });
  return {
    storage: config,
    storage_path: storagePath,
    storage_root: storageRoot,
    events_path: durableStorageEventsPath(rootDir)
  };
}

export async function writeDurableObject({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  storagePath = durableStoragePath(rootDir),
  tenantSlug,
  key,
  value,
  actor = "storage_api",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  storagePath?: string;
  tenantSlug: string;
  key: string;
  value: any;
  actor?: string;
  now?: string;
}) {
  const slug = normalizeTenantSlug(tenantSlug);
  const objectKey = safeObjectKey(key);
  assertNoSensitivePayload({ [objectKey]: value });
  await resolveTenant({ rootDir, configPath, tenantSlug: slug });
  const config = await loadDurableStorageConfig({ rootDir, storagePath });
  assertInsideRoot(rootDir, config.storage_root);
  const out = objectPath(config.storage_root, slug, objectKey);
  assertInsideRoot(rootDir, out);
  const body = {
    schema_version: "0.1.0",
    tenant_slug: slug,
    key: objectKey,
    value,
    value_hash: stableHash(value),
    written_by: actor,
    written_at: now
  };
  await writeJson(out, body);
  const objectRecord = {
    id: makeId("storage_obj", { slug, objectKey }),
    tenant_slug: slug,
    key: objectKey,
    path: out,
    value_hash: body.value_hash,
    updated_at: now,
    raw_secret_stored: false
  };
  const saved = await saveDurableStorageConfig(rootDir, {
    ...config,
    objects: [
      ...config.objects.filter((item: any) => !(item.tenant_slug === slug && item.key === objectKey)),
      objectRecord
    ]
  }, storagePath);
  await appendStorageEvent({
    rootDir,
    eventType: "durable_object_written",
    actor,
    payload: {
      tenant_slug: slug,
      key: objectKey,
      value_hash: body.value_hash
    },
    now
  });
  return {
    object: objectRecord,
    object_path: out,
    object_count: saved.objects.length
  };
}

export async function readDurableObject({
  rootDir = "managed-saas",
  storagePath = durableStoragePath(rootDir),
  tenantSlug,
  key
}: {
  rootDir?: string;
  storagePath?: string;
  tenantSlug: string;
  key: string;
}) {
  const slug = normalizeTenantSlug(tenantSlug);
  const objectKey = safeObjectKey(key);
  const config = await loadDurableStorageConfig({ rootDir, storagePath });
  const record = config.objects.find((item: any) => item.tenant_slug === slug && item.key === objectKey);
  if (!record) throw new Error(`Unknown durable object ${slug}/${objectKey}.`);
  assertInsideRoot(rootDir, record.path);
  return {
    object: await readJsonIfExists(record.path, {}),
    record
  };
}

export async function createStorageCheckpoint({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  storagePath = durableStoragePath(rootDir),
  tenantSlug,
  label = "manual_checkpoint",
  actor = "storage_api",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  storagePath?: string;
  tenantSlug?: string;
  label?: string;
  actor?: string;
  now?: string;
}) {
  const config = await loadDurableStorageConfig({ rootDir, storagePath });
  assertInsideRoot(rootDir, config.storage_root);
  const normalizedTenant = tenantSlug ? normalizeTenantSlug(tenantSlug) : "";
  const selectedObjects = normalizedTenant
    ? config.objects.filter((item: any) => item.tenant_slug === normalizedTenant)
    : config.objects;
  const persistence = await tenantPersistenceStatus({
    rootDir,
    configPath,
    tenantSlug: normalizedTenant || undefined,
    now
  });
  const checkpoint = {
    id: makeId("storage_checkpoint", {
      rootDir,
      normalizedTenant,
      objectHashes: selectedObjects.map((item: any) => item.value_hash),
      now
    }),
    label,
    tenant_slug: normalizedTenant,
    object_count: selectedObjects.length,
    tenant_count: persistence.summary.tenant_count,
    dossier_count: persistence.summary.total_dossier_count,
    state_key_count: persistence.summary.total_state_key_count,
    event_count: persistence.summary.total_event_count,
    object_hashes: selectedObjects.map((item: any) => ({
      tenant_slug: item.tenant_slug,
      key: item.key,
      value_hash: item.value_hash
    })),
    created_by: actor,
    created_at: now
  };
  const checkpointPath = path.join(config.storage_root, "checkpoints", `${checkpoint.id}.json`);
  assertInsideRoot(rootDir, checkpointPath);
  await writeJson(checkpointPath, checkpoint);
  const checkpointRecord = {
    id: checkpoint.id,
    label,
    tenant_slug: normalizedTenant,
    path: checkpointPath,
    object_count: selectedObjects.length,
    created_at: now
  };
  const saved = await saveDurableStorageConfig(rootDir, {
    ...config,
    checkpoints: [
      ...config.checkpoints.filter((item: any) => item.id !== checkpoint.id),
      checkpointRecord
    ]
  }, storagePath);
  await appendStorageEvent({
    rootDir,
    eventType: "durable_storage_checkpoint_created",
    actor,
    payload: {
      checkpoint_id: checkpoint.id,
      tenant_slug: normalizedTenant,
      object_count: selectedObjects.length
    },
    now
  });
  return {
    checkpoint,
    checkpoint_path: checkpointPath,
    checkpoint_count: saved.checkpoints.length
  };
}

export async function durableStorageStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  storagePath = durableStoragePath(rootDir),
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  storagePath?: string;
  now?: string;
} = {}) {
  await loadManagedSaasConfig({ rootDir, configPath });
  const config = await loadDurableStorageConfig({ rootDir, storagePath });
  const events = parseJsonLines(await readTextIfExists(durableStorageEventsPath(rootDir)));
  const objectPathsIsolated = config.objects.every((object: any) => {
    try {
      assertInsideRoot(rootDir, object.path);
      return object.path.includes(`${path.sep}durable-storage${path.sep}tenants${path.sep}${object.tenant_slug}${path.sep}objects`);
    } catch {
      return false;
    }
  });
  const checkpointsIsolated = config.checkpoints.every((checkpoint: any) => {
    try {
      assertInsideRoot(rootDir, checkpoint.path);
      return checkpoint.path.includes(`${path.sep}durable-storage${path.sep}checkpoints${path.sep}`);
    } catch {
      return false;
    }
  });
  let storageRootInside = true;
  try {
    assertInsideRoot(rootDir, config.storage_root);
  } catch {
    storageRootInside = false;
  }
  const controls = [
    {
      id: "durable_storage_initialized",
      passed: Boolean(config.created_at),
      severity: "required",
      detail: "Durable storage manifest exists."
    },
    {
      id: "storage_root_inside_managed_root",
      passed: storageRootInside,
      severity: "required",
      detail: "Storage root stays inside the managed SaaS root."
    },
    {
      id: "tenant_object_paths_isolated",
      passed: objectPathsIsolated,
      severity: "required",
      detail: "Tenant object paths use tenant-scoped storage prefixes."
    },
    {
      id: "checkpoint_exists",
      passed: config.checkpoints.length > 0,
      severity: "required",
      detail: "At least one durability checkpoint exists."
    },
    {
      id: "checkpoint_paths_isolated",
      passed: checkpointsIsolated,
      severity: "required",
      detail: "Checkpoint files stay under the durable storage checkpoint prefix."
    },
    {
      id: "raw_secret_storage_blocked",
      passed: config.durability_model?.raw_secret_storage_allowed === false && config.objects.every((item: any) => item.raw_secret_stored === false),
      severity: "required",
      detail: "Storage manifest and object records do not store raw secrets."
    },
    {
      id: "direct_cloud_storage_connection_disabled",
      passed: config.durability_model?.direct_cloud_storage_connection === false,
      severity: "required",
      detail: "This phase defines the durable storage contract without connecting production cloud storage."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    storage_path: storagePath,
    events_path: durableStorageEventsPath(rootDir),
    status: requiredFailures.length === 0 ? "ready_for_durable_storage_foundation" : "blocked",
    summary: {
      object_count: config.objects.length,
      checkpoint_count: config.checkpoints.length,
      event_count: events.length,
      required_failure_count: requiredFailures.length,
      raw_secret_stored: false,
      direct_cloud_storage_connection: false
    },
    controls,
    storage: {
      storage_root: config.storage_root,
      provider: config.provider,
      region: config.region,
      durability_model: config.durability_model
    },
    objects: config.objects,
    checkpoints: config.checkpoints,
    latest_events: events.slice(-8).reverse()
  };
}
