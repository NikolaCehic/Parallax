import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId } from "../core/ids.js";
import { listLibraryEntries } from "../library/store.js";
import { loadManagedSaasConfig, managedSaasConfigPath } from "./managed.js";

export const TENANT_STATE_FILE = "tenant-state.json";
export const TENANT_EVENTS_FILE = "tenant-events.jsonl";

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

export function normalizeTenantSlug(slug: string) {
  const normalized = String(slug ?? "").trim().toLowerCase();
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

function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9_.-]{1,80}$/.test(key)) {
    throw new Error("State key must be 2-81 chars and contain only lowercase letters, numbers, dot, hyphen, or underscore.");
  }
  if (key.includes("..") || key.includes("/") || key.includes("\\")) {
    throw new Error("State key cannot contain path traversal characters.");
  }
}

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "secret://"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive payload field is not allowed: ${forbidden}`);
    }
  }
}

export async function resolveTenant({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug: string;
}) {
  const slug = normalizeTenantSlug(tenantSlug);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const tenant = config.tenants.find((item: any) => item.slug === slug);
  if (!tenant) throw new Error(`Unknown tenant ${slug}.`);
  assertInsideRoot(rootDir, tenant.audit_dir);
  const tenant_dir = path.dirname(tenant.audit_dir);
  assertInsideRoot(rootDir, tenant_dir);
  return {
    tenant,
    tenant_slug: slug,
    tenant_dir,
    audit_dir: tenant.audit_dir,
    state_path: path.join(tenant_dir, TENANT_STATE_FILE),
    events_path: path.join(tenant_dir, TENANT_EVENTS_FILE)
  };
}

export async function readTenantState({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug: string;
}) {
  const resolved = await resolveTenant({ rootDir, configPath, tenantSlug });
  const state = await readJsonIfExists(resolved.state_path, {
    schema_version: "0.1.0",
    tenant_slug: resolved.tenant_slug,
    values: {},
    updated_at: ""
  });
  return {
    ...state,
    tenant_slug: resolved.tenant_slug,
    state_path: resolved.state_path
  };
}

export async function readTenantEvents({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug: string;
}) {
  const resolved = await resolveTenant({ rootDir, configPath, tenantSlug });
  return {
    tenant_slug: resolved.tenant_slug,
    events_path: resolved.events_path,
    events: parseJsonLines(await readTextIfExists(resolved.events_path))
  };
}

export async function appendTenantEvent({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug,
  eventType,
  actor = "hosted_api",
  payload = {},
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, any>;
  now?: string;
}) {
  assertNoSensitivePayload(payload);
  const resolved = await resolveTenant({ rootDir, configPath, tenantSlug });
  const event = {
    id: makeId("tenant_evt", {
      tenantSlug: resolved.tenant_slug,
      eventType,
      actor,
      payload,
      now
    }),
    tenant_slug: resolved.tenant_slug,
    event_type: eventType,
    actor,
    payload,
    created_at: now
  };
  await mkdir(resolved.tenant_dir, { recursive: true });
  await appendFile(resolved.events_path, `${JSON.stringify(event)}\n`);
  return {
    event,
    events_path: resolved.events_path
  };
}

export async function saveTenantStateValue({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug,
  key,
  value,
  actor = "hosted_api",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug: string;
  key: string;
  value: any;
  actor?: string;
  now?: string;
}) {
  const safeKey = String(key ?? "").trim().toLowerCase();
  assertSafeKey(safeKey);
  assertNoSensitivePayload({ [safeKey]: value });
  const resolved = await resolveTenant({ rootDir, configPath, tenantSlug });
  const previous = await readJsonIfExists(resolved.state_path, {
    schema_version: "0.1.0",
    tenant_slug: resolved.tenant_slug,
    values: {}
  });
  const state = {
    schema_version: "0.1.0",
    tenant_slug: resolved.tenant_slug,
    values: {
      ...(previous.values ?? {}),
      [safeKey]: value
    },
    updated_by: actor,
    updated_at: now
  };
  await writeJson(resolved.state_path, state);
  await appendTenantEvent({
    rootDir,
    configPath,
    tenantSlug: resolved.tenant_slug,
    eventType: "tenant_state_write",
    actor,
    payload: { key: safeKey },
    now
  });
  return {
    state,
    key: safeKey,
    state_path: resolved.state_path
  };
}

export async function tenantPersistenceStatus({
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
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const selected = tenantSlug
    ? config.tenants.filter((tenant: any) => tenant.slug === normalizeTenantSlug(tenantSlug))
    : config.tenants;
  if (tenantSlug && !selected.length) throw new Error(`Unknown tenant ${normalizeTenantSlug(tenantSlug)}.`);

  const tenants = [];
  for (const tenant of selected) {
    const resolved = await resolveTenant({ rootDir, configPath, tenantSlug: tenant.slug });
    const state = await readJsonIfExists(resolved.state_path, {
      schema_version: "0.1.0",
      tenant_slug: tenant.slug,
      values: {}
    });
    const events = parseJsonLines(await readTextIfExists(resolved.events_path));
    const library = await listLibraryEntries({ auditDir: resolved.audit_dir });
    tenants.push({
      tenant_slug: tenant.slug,
      tenant_name: tenant.name,
      status: tenant.status,
      audit_dir: resolved.audit_dir,
      state_path: resolved.state_path,
      events_path: resolved.events_path,
      state_key_count: Object.keys(state.values ?? {}).length,
      event_count: events.length,
      dossier_count: library.entries.length,
      latest_event: events.slice(-1)[0] ?? null
    });
  }

  const isolated = tenants.every((tenant: any) => {
    try {
      assertInsideRoot(rootDir, tenant.audit_dir);
      assertInsideRoot(rootDir, tenant.state_path);
      assertInsideRoot(rootDir, tenant.events_path);
      return true;
    } catch {
      return false;
    }
  });

  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    status: isolated ? "ready_for_tenant_persistence" : "blocked",
    summary: {
      tenant_count: tenants.length,
      total_state_key_count: tenants.reduce((sum: number, tenant: any) => sum + tenant.state_key_count, 0),
      total_event_count: tenants.reduce((sum: number, tenant: any) => sum + tenant.event_count, 0),
      total_dossier_count: tenants.reduce((sum: number, tenant: any) => sum + tenant.dossier_count, 0),
      tenant_paths_isolated: isolated
    },
    tenants
  };
}
