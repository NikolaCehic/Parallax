import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId, stableHash } from "../core/ids.js";
import { loadManagedSaasConfig, managedSaasConfigPath } from "./managed.js";
import { normalizeTenantSlug } from "./persistence.js";

export const IDENTITY_DIRECTORY_FILE = "identity-directory.json";
export const IDENTITY_EVENTS_FILE = "identity-events.jsonl";

const PLATFORM_SCOPES = [
  "control_plane:read",
  "control_plane:write",
  "identity:write",
  "tenant:read",
  "tenant:write",
  "analysis:create",
  "storage:read",
  "storage:write",
  "storage:checkpoint",
  "console:read"
];

const ROLE_SCOPES: Record<string, string[]> = {
  platform_admin: PLATFORM_SCOPES,
  tenant_admin: ["tenant:read", "tenant:write", "analysis:create", "storage:read", "storage:write", "console:read"],
  analyst: ["tenant:read", "analysis:create", "storage:read", "storage:write"],
  reviewer: ["tenant:read", "storage:read"]
};

export const TENANT_IDENTITY_ROLES = ["tenant_admin", "analyst", "reviewer"];

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

function identityDirectoryPath(rootDir = "managed-saas") {
  return path.join(rootDir, IDENTITY_DIRECTORY_FILE);
}

function identityEventsPath(rootDir = "managed-saas") {
  return path.join(rootDir, IDENTITY_EVENTS_FILE);
}

function normalizeEmail(email: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Identity email must be a valid email address.");
  }
  return normalized;
}

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "password", "secret://"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive identity payload field is not allowed: ${forbidden}`);
    }
  }
}

function defaultDirectory({
  rootDir = "managed-saas",
  issuer = "parallax-local-identity",
  now = isoNow()
}: {
  rootDir?: string;
  issuer?: string;
  now?: string;
} = {}) {
  return {
    schema_version: "0.1.0",
    issuer,
    root_dir: rootDir,
    created_at: now,
    token_policy: {
      default_ttl_minutes: 60,
      max_ttl_minutes: 240,
      raw_session_token_storage_allowed: false,
      bearer_tokens_are_hash_only: true
    },
    principals: [],
    sessions: []
  };
}

async function appendIdentityEvent({
  rootDir = "managed-saas",
  eventType,
  actor = "identity_system",
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
    id: makeId("identity_evt", { rootDir, eventType, actor, payload, now }),
    event_type: eventType,
    actor,
    payload,
    created_at: now
  };
  await mkdir(rootDir, { recursive: true });
  await appendFile(identityEventsPath(rootDir), `${JSON.stringify(event)}\n`);
  return event;
}

async function loadIdentityDirectory({
  rootDir = "managed-saas",
  directoryPath = identityDirectoryPath(rootDir)
}: {
  rootDir?: string;
  directoryPath?: string;
} = {}) {
  const directory = await readJsonIfExists(directoryPath, defaultDirectory({ rootDir }));
  return {
    ...defaultDirectory({ rootDir }),
    ...directory,
    root_dir: rootDir,
    principals: directory.principals ?? [],
    sessions: directory.sessions ?? []
  };
}

async function saveIdentityDirectory(rootDir: string, directory: any, directoryPath = identityDirectoryPath(rootDir)) {
  const next = {
    ...directory,
    schema_version: "0.1.0",
    root_dir: rootDir,
    updated_at: isoNow()
  };
  assertNoSensitivePayload(next);
  await writeJson(directoryPath, next);
  return next;
}

function defaultScopes(role: string) {
  return ROLE_SCOPES[role] ?? ROLE_SCOPES.reviewer;
}

function principalHasTenant(principal: any, tenantSlug: string) {
  if (principal.platform_admin === true) return true;
  return (principal.memberships ?? []).some((membership: any) => membership.tenant_slug === tenantSlug);
}

function membershipForTenant(principal: any, tenantSlug: string) {
  if (principal.platform_admin === true) {
    return { tenant_slug: tenantSlug, role: "platform_admin", scopes: PLATFORM_SCOPES };
  }
  return (principal.memberships ?? []).find((membership: any) => membership.tenant_slug === tenantSlug);
}

export async function initializeIdentityDirectory({
  rootDir = "managed-saas",
  directoryPath = identityDirectoryPath(rootDir),
  issuer = "parallax-local-identity",
  now = isoNow()
}: {
  rootDir?: string;
  directoryPath?: string;
  issuer?: string;
  now?: string;
} = {}) {
  const directory = defaultDirectory({ rootDir, issuer, now });
  await writeJson(directoryPath, directory);
  await appendIdentityEvent({
    rootDir,
    eventType: "identity_directory_initialized",
    actor: "platform",
    payload: { issuer },
    now
  });
  return {
    directory,
    directory_path: directoryPath,
    events_path: identityEventsPath(rootDir)
  };
}

export async function registerIdentityPrincipal({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  directoryPath = identityDirectoryPath(rootDir),
  email,
  name = "",
  tenantSlug = "",
  role = "analyst",
  scopes,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  directoryPath?: string;
  email: string;
  name?: string;
  tenantSlug?: string;
  role?: string;
  scopes?: string[];
  actor?: string;
  now?: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const platformAdmin = role === "platform_admin";
  const normalizedTenant = platformAdmin || !tenantSlug ? "" : normalizeTenantSlug(tenantSlug);
  if (normalizedTenant && !config.tenants.some((tenant: any) => tenant.slug === normalizedTenant)) {
    throw new Error(`Unknown tenant ${normalizedTenant}.`);
  }
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const existing = directory.principals.find((principal: any) => principal.email === normalizedEmail);
  const membership = normalizedTenant
    ? {
        tenant_slug: normalizedTenant,
        role,
        scopes: scopes?.length ? scopes : defaultScopes(role)
      }
    : undefined;
  const principal = {
    id: existing?.id ?? makeId("principal", { normalizedEmail, name, now }),
    email: normalizedEmail,
    name: name || existing?.name || normalizedEmail,
    status: "active",
    platform_admin: platformAdmin || existing?.platform_admin === true,
    memberships: membership
      ? [
          ...(existing?.memberships ?? []).filter((item: any) => item.tenant_slug !== normalizedTenant),
          membership
        ]
      : existing?.memberships ?? [],
    created_at: existing?.created_at ?? now,
    updated_at: now
  };
  const saved = await saveIdentityDirectory(rootDir, {
    ...directory,
    principals: [
      ...directory.principals.filter((item: any) => item.email !== normalizedEmail),
      principal
    ]
  }, directoryPath);
  await appendIdentityEvent({
    rootDir,
    eventType: "identity_principal_registered",
    actor,
    payload: {
      principal_id: principal.id,
      email: principal.email,
      tenant_slug: normalizedTenant,
      role
    },
    now
  });
  return {
    principal,
    principal_count: saved.principals.length,
    directory_path: directoryPath
  };
}

export async function issueIdentitySession({
  rootDir = "managed-saas",
  directoryPath = identityDirectoryPath(rootDir),
  email,
  tenantSlug = "",
  ttlMinutes,
  actor = "identity_provider",
  now = isoNow()
}: {
  rootDir?: string;
  directoryPath?: string;
  email: string;
  tenantSlug?: string;
  ttlMinutes?: number;
  actor?: string;
  now?: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const principal = directory.principals.find((item: any) => item.email === normalizedEmail && item.status === "active");
  if (!principal) throw new Error(`Unknown active principal ${normalizedEmail}.`);
  const normalizedTenant = tenantSlug ? normalizeTenantSlug(tenantSlug) : "";
  if (normalizedTenant && !principalHasTenant(principal, normalizedTenant)) {
    throw new Error(`Principal ${normalizedEmail} cannot issue a session for tenant ${normalizedTenant}.`);
  }
  const sessionTenant = normalizedTenant || principal.memberships?.[0]?.tenant_slug || "";
  const membership = sessionTenant ? membershipForTenant(principal, sessionTenant) : { role: "platform_admin", scopes: PLATFORM_SCOPES };
  const maxTtl = Number(directory.token_policy?.max_ttl_minutes ?? 240);
  const requestedTtl = ttlMinutes ?? Number(directory.token_policy?.default_ttl_minutes ?? 60);
  const boundedTtl = Math.max(1, Math.min(requestedTtl, maxTtl));
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + boundedTtl * 60_000).toISOString();
  const sessionToken = `psess_${randomBytes(24).toString("base64url")}`;
  const tokenHash = stableHash({ sessionToken, purpose: "parallax_identity_session" });
  const session = {
    id: makeId("session", { tokenHash, normalizedEmail, sessionTenant, now }),
    principal_id: principal.id,
    email: principal.email,
    tenant_slug: sessionTenant,
    role: membership?.role ?? "reviewer",
    scopes: membership?.scopes ?? [],
    token_hash: tokenHash,
    issued_at: now,
    expires_at: expiresAt,
    revoked_at: "",
    raw_session_token_stored: false
  };
  const saved = await saveIdentityDirectory(rootDir, {
    ...directory,
    sessions: [
      ...directory.sessions.filter((item: any) => item.id !== session.id),
      session
    ]
  }, directoryPath);
  await appendIdentityEvent({
    rootDir,
    eventType: "identity_session_issued",
    actor,
    payload: {
      session_id: session.id,
      principal_id: principal.id,
      email: principal.email,
      tenant_slug: sessionTenant,
      expires_at: expiresAt
    },
    now
  });
  return {
    session: {
      ...session,
      token_hash: session.token_hash,
      raw_session_token_stored: false
    },
    session_token: sessionToken,
    session_count: saved.sessions.length,
    raw_session_token_stored: false,
    directory_path: directoryPath
  };
}

export async function verifyIdentitySession({
  rootDir = "managed-saas",
  directoryPath = identityDirectoryPath(rootDir),
  sessionToken,
  tenantSlug = "",
  requiredScope = "",
  now = isoNow()
}: {
  rootDir?: string;
  directoryPath?: string;
  sessionToken: string;
  tenantSlug?: string;
  requiredScope?: string;
  now?: string;
}) {
  if (!sessionToken) throw new Error("Identity session token is required.");
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const tokenHash = stableHash({ sessionToken, purpose: "parallax_identity_session" });
  const session = directory.sessions.find((item: any) => item.token_hash === tokenHash);
  if (!session) throw new Error("Identity session token is unknown.");
  if (session.revoked_at) throw new Error("Identity session has been revoked.");
  if (new Date(session.expires_at).getTime() <= new Date(now).getTime()) {
    throw new Error("Identity session has expired.");
  }
  const principal = directory.principals.find((item: any) => item.id === session.principal_id && item.status === "active");
  if (!principal) throw new Error("Identity principal is not active.");
  const normalizedTenant = tenantSlug ? normalizeTenantSlug(tenantSlug) : "";
  if (normalizedTenant && !principalHasTenant(principal, normalizedTenant)) {
    const error: any = new Error(`Identity session cannot access tenant ${normalizedTenant}.`);
    error.statusCode = 403;
    throw error;
  }
  const scopes = principal.platform_admin ? PLATFORM_SCOPES : session.scopes ?? [];
  if (requiredScope && !scopes.includes(requiredScope) && !scopes.includes("*")) {
    const error: any = new Error(`Identity session lacks required scope ${requiredScope}.`);
    error.statusCode = 403;
    throw error;
  }
  return {
    authenticated: true,
    principal: {
      id: principal.id,
      email: principal.email,
      name: principal.name,
      platform_admin: principal.platform_admin === true
    },
    session: {
      id: session.id,
      tenant_slug: session.tenant_slug,
      role: session.role,
      scopes,
      expires_at: session.expires_at,
      raw_session_token_stored: false
    }
  };
}

export async function revokeIdentitySession({
  rootDir = "managed-saas",
  directoryPath = identityDirectoryPath(rootDir),
  sessionId,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  directoryPath?: string;
  sessionId: string;
  actor?: string;
  now?: string;
}) {
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const sessions = directory.sessions.map((session: any) =>
    session.id === sessionId ? { ...session, revoked_at: now } : session
  );
  const saved = await saveIdentityDirectory(rootDir, { ...directory, sessions }, directoryPath);
  await appendIdentityEvent({
    rootDir,
    eventType: "identity_session_revoked",
    actor,
    payload: { session_id: sessionId },
    now
  });
  return {
    session_id: sessionId,
    revoked: saved.sessions.some((session: any) => session.id === sessionId && session.revoked_at === now),
    directory_path: directoryPath
  };
}

export async function updateIdentityPrincipalProfile({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  directoryPath = identityDirectoryPath(rootDir),
  email,
  name,
  defaultTenantSlug = "",
  actor = "account",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  directoryPath?: string;
  email: string;
  name?: string;
  defaultTenantSlug?: string;
  actor?: string;
  now?: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const normalizedTenant = defaultTenantSlug ? normalizeTenantSlug(defaultTenantSlug) : "";
  if (normalizedTenant && !config.tenants.some((tenant: any) => tenant.slug === normalizedTenant)) {
    throw new Error(`Unknown tenant ${normalizedTenant}.`);
  }
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const principal = directory.principals.find((item: any) => item.email === normalizedEmail && item.status === "active");
  if (!principal) throw new Error(`Unknown active principal ${normalizedEmail}.`);
  const hasTenant = !normalizedTenant || principal.platform_admin === true ||
    (principal.memberships ?? []).some((membership: any) => membership.tenant_slug === normalizedTenant);
  if (!hasTenant) {
    const error: any = new Error(`Principal ${normalizedEmail} cannot set default tenant ${normalizedTenant}.`);
    error.statusCode = 403;
    throw error;
  }
  const updated = {
    ...principal,
    name: name ? String(name) : principal.name,
    preferences: {
      ...(principal.preferences ?? {}),
      default_tenant_slug: normalizedTenant || principal.preferences?.default_tenant_slug || ""
    },
    updated_at: now
  };
  const saved = await saveIdentityDirectory(rootDir, {
    ...directory,
    principals: directory.principals.map((item: any) => item.id === principal.id ? updated : item)
  }, directoryPath);
  await appendIdentityEvent({
    rootDir,
    eventType: "identity_principal_profile_updated",
    actor,
    payload: {
      principal_id: principal.id,
      email: normalizedEmail,
      default_tenant_slug: updated.preferences.default_tenant_slug
    },
    now
  });
  return {
    principal: {
      id: updated.id,
      email: updated.email,
      name: updated.name,
      status: updated.status,
      platform_admin: updated.platform_admin === true,
      memberships: updated.memberships ?? [],
      preferences: updated.preferences ?? {}
    },
    principal_count: saved.principals.length,
    directory_path: directoryPath
  };
}

export async function updateIdentityMembershipRole({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  directoryPath = identityDirectoryPath(rootDir),
  email,
  tenantSlug,
  role,
  scopes,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  directoryPath?: string;
  email: string;
  tenantSlug: string;
  role: string;
  scopes?: string[];
  actor?: string;
  now?: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedTenant = normalizeTenantSlug(tenantSlug);
  const normalizedRole = String(role ?? "").trim().toLowerCase();
  if (!TENANT_IDENTITY_ROLES.includes(normalizedRole)) {
    throw new Error(`Membership role must be one of ${TENANT_IDENTITY_ROLES.join(", ")}.`);
  }
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  if (!config.tenants.some((tenant: any) => tenant.slug === normalizedTenant)) {
    throw new Error(`Unknown tenant ${normalizedTenant}.`);
  }
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const principal = directory.principals.find((item: any) => item.email === normalizedEmail && item.status === "active");
  if (!principal) throw new Error(`Unknown active principal ${normalizedEmail}.`);
  const membership = {
    tenant_slug: normalizedTenant,
    role: normalizedRole,
    scopes: scopes?.length ? scopes : defaultScopes(normalizedRole)
  };
  const updatedPrincipal = {
    ...principal,
    memberships: [
      ...(principal.memberships ?? []).filter((item: any) => item.tenant_slug !== normalizedTenant),
      membership
    ],
    updated_at: now
  };
  let updatedSessionCount = 0;
  const sessions = directory.sessions.map((session: any) => {
    if (session.principal_id === principal.id && session.tenant_slug === normalizedTenant && !session.revoked_at) {
      updatedSessionCount += 1;
      return {
        ...session,
        role: membership.role,
        scopes: membership.scopes
      };
    }
    return session;
  });
  const saved = await saveIdentityDirectory(rootDir, {
    ...directory,
    principals: directory.principals.map((item: any) => item.id === principal.id ? updatedPrincipal : item),
    sessions
  }, directoryPath);
  await appendIdentityEvent({
    rootDir,
    eventType: "identity_membership_role_updated",
    actor,
    payload: {
      principal_id: principal.id,
      email: normalizedEmail,
      tenant_slug: normalizedTenant,
      role: normalizedRole,
      updated_session_count: updatedSessionCount
    },
    now
  });
  return {
    principal: {
      id: updatedPrincipal.id,
      email: updatedPrincipal.email,
      name: updatedPrincipal.name,
      status: updatedPrincipal.status,
      platform_admin: updatedPrincipal.platform_admin === true,
      memberships: updatedPrincipal.memberships ?? [],
      preferences: updatedPrincipal.preferences ?? {}
    },
    membership,
    updated_session_count: updatedSessionCount,
    principal_count: saved.principals.length,
    directory_path: directoryPath
  };
}

export async function identityStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  directoryPath = identityDirectoryPath(rootDir),
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  directoryPath?: string;
  now?: string;
} = {}) {
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const directory = await loadIdentityDirectory({ rootDir, directoryPath });
  const events = parseJsonLines(await readTextIfExists(identityEventsPath(rootDir)));
  const tenantSet = new Set(config.tenants.map((tenant: any) => tenant.slug));
  const tenantMemberships = directory.principals.flatMap((principal: any) =>
    (principal.memberships ?? []).map((membership: any) => ({
      principal_id: principal.id,
      email: principal.email,
      ...membership
    }))
  );
  const membershipsValid = tenantMemberships.every((membership: any) => tenantSet.has(membership.tenant_slug));
  const sessionsHashOnly = directory.sessions.every((session: any) =>
    Boolean(session.token_hash) &&
    session.raw_session_token_stored === false &&
    !("session_token" in session)
  );
  const activeSessions = directory.sessions.filter((session: any) =>
    !session.revoked_at && new Date(session.expires_at).getTime() > new Date(now).getTime()
  );
  const controls = [
    {
      id: "identity_directory_initialized",
      passed: Boolean(directory.created_at),
      severity: "required",
      detail: "Identity directory is initialized."
    },
    {
      id: "principal_count",
      passed: directory.principals.length > 0,
      severity: "required",
      detail: "At least one identity principal exists."
    },
    {
      id: "tenant_memberships_valid",
      passed: membershipsValid,
      severity: "required",
      detail: "Tenant memberships refer to known managed SaaS tenants."
    },
    {
      id: "sessions_hash_only",
      passed: sessionsHashOnly,
      severity: "required",
      detail: "Persisted sessions contain hashes only, never raw bearer values."
    },
    {
      id: "raw_session_token_storage_blocked",
      passed: directory.token_policy?.raw_session_token_storage_allowed === false,
      severity: "required",
      detail: "Identity token policy blocks raw session token storage."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    directory_path: directoryPath,
    events_path: identityEventsPath(rootDir),
    status: requiredFailures.length === 0 ? "ready_for_identity_foundation" : "blocked",
    summary: {
      principal_count: directory.principals.length,
      tenant_membership_count: tenantMemberships.length,
      session_count: directory.sessions.length,
      active_session_count: activeSessions.length,
      event_count: events.length,
      raw_session_token_stored: false,
      required_failure_count: requiredFailures.length
    },
    controls,
    principals: directory.principals.map((principal: any) => ({
      id: principal.id,
      email: principal.email,
      name: principal.name,
      status: principal.status,
      platform_admin: principal.platform_admin === true,
      memberships: principal.memberships ?? [],
      preferences: principal.preferences ?? {}
    })),
    sessions: directory.sessions.map((session: any) => ({
      id: session.id,
      email: session.email,
      tenant_slug: session.tenant_slug,
      role: session.role,
      scopes: session.scopes,
      issued_at: session.issued_at,
      expires_at: session.expires_at,
      revoked_at: session.revoked_at,
      raw_session_token_stored: false
    })),
    latest_events: events.slice(-8).reverse()
  };
}
