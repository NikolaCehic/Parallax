import { randomBytes } from "node:crypto";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { isoNow, makeId, stableHash } from "../core/ids.js";
import { loadManagedSaasConfig, managedSaasConfigPath } from "./managed.js";
import { normalizeTenantSlug } from "./persistence.js";
import {
  identityStatus,
  issueIdentitySession,
  registerIdentityPrincipal
} from "./identity.js";

export const WORKSPACE_INVITATIONS_FILE = "workspace-invitations.json";
export const WORKSPACE_ONBOARDING_EVENTS_FILE = "workspace-onboarding-events.jsonl";

const INVITE_TOKEN_PURPOSE = "parallax_workspace_invitation";
const DEFAULT_INVITE_TTL_MINUTES = 7 * 24 * 60;
const DEFAULT_SESSION_TTL_MINUTES = 240;
const INVITABLE_ROLES = ["tenant_admin", "analyst", "reviewer"];

function invitationsPath(rootDir = "managed-saas") {
  return path.join(rootDir, WORKSPACE_INVITATIONS_FILE);
}

function onboardingEventsPath(rootDir = "managed-saas") {
  return path.join(rootDir, WORKSPACE_ONBOARDING_EVENTS_FILE);
}

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

function normalizeEmail(email: string) {
  const normalized = String(email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new Error("Invitation email must be a valid email address.");
  }
  return normalized;
}

function normalizeRole(role = "analyst") {
  const normalized = String(role || "analyst").trim().toLowerCase();
  if (!INVITABLE_ROLES.includes(normalized)) {
    throw new Error(`Invitation role must be one of ${INVITABLE_ROLES.join(", ")}.`);
  }
  return normalized;
}

function normalizeTtlMinutes(value: any, fallback = DEFAULT_INVITE_TTL_MINUTES) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5, Math.min(Math.round(parsed), DEFAULT_INVITE_TTL_MINUTES));
}

function inviteTokenHash(inviteToken: string) {
  return stableHash({ inviteToken, purpose: INVITE_TOKEN_PURPOSE });
}

function makeInviteToken() {
  return `pinv_${randomBytes(24).toString("base64url")}`;
}

function expiresAt(now: string, ttlMinutes: number) {
  return new Date(new Date(now).getTime() + ttlMinutes * 60_000).toISOString();
}

function defaultRegistry({ rootDir = "managed-saas", now = isoNow() }: { rootDir?: string; now?: string } = {}) {
  return {
    schema_version: "0.1.0",
    root_dir: rootDir,
    created_at: now,
    token_policy: {
      invite_token_prefix: "pinv_",
      default_ttl_minutes: DEFAULT_INVITE_TTL_MINUTES,
      raw_invite_token_storage_allowed: false,
      raw_session_token_storage_allowed: false,
      invite_tokens_are_hash_only: true
    },
    invitations: []
  };
}

async function loadInvitationRegistry({
  rootDir = "managed-saas",
  registryPath = invitationsPath(rootDir),
  now = isoNow()
}: {
  rootDir?: string;
  registryPath?: string;
  now?: string;
} = {}) {
  const registry = await readJsonIfExists(registryPath, defaultRegistry({ rootDir, now }));
  return {
    ...defaultRegistry({ rootDir, now }),
    ...registry,
    root_dir: rootDir,
    token_policy: {
      ...defaultRegistry({ rootDir, now }).token_policy,
      ...(registry.token_policy ?? {})
    },
    invitations: registry.invitations ?? []
  };
}

async function saveInvitationRegistry(rootDir: string, registry: any, registryPath = invitationsPath(rootDir), now = isoNow()) {
  const next = {
    ...registry,
    schema_version: "0.1.0",
    root_dir: rootDir,
    updated_at: now
  };
  assertNoSensitivePayload(next);
  await writeJson(registryPath, next);
  return next;
}

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "password", "secret://", "session_token\"", "invite_token\""]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive onboarding payload field is not allowed: ${forbidden}`);
    }
  }
}

async function appendOnboardingEvent({
  rootDir,
  eventType,
  actor = "workspace_onboarding",
  payload = {},
  now
}: {
  rootDir: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, any>;
  now: string;
}) {
  assertNoSensitivePayload(payload);
  const event = {
    id: makeId("onboarding_evt", { rootDir, eventType, actor, payload, now }),
    event_type: eventType,
    actor,
    payload,
    created_at: now
  };
  await mkdir(rootDir, { recursive: true });
  await appendFile(onboardingEventsPath(rootDir), `${JSON.stringify(event)}\n`);
  return event;
}

function sanitizeInvitation(invitation: any, now = isoNow()) {
  const expired = !invitation.accepted_at &&
    !invitation.revoked_at &&
    new Date(invitation.expires_at).getTime() <= new Date(now).getTime();
  const status = invitation.revoked_at
    ? "revoked"
    : invitation.accepted_at
      ? "accepted"
      : expired
        ? "expired"
        : "pending";
  const {
    invite_token,
    session_token,
    ...rest
  } = invitation;
  void invite_token;
  void session_token;
  return {
    ...rest,
    status,
    raw_invite_token_stored: false,
    raw_session_token_stored: false
  };
}

function summarizeInvitations(invitations: any[], now: string) {
  const sanitized = invitations.map((invitation) => sanitizeInvitation(invitation, now));
  return {
    invite_count: sanitized.length,
    pending_count: sanitized.filter((item) => item.status === "pending").length,
    accepted_count: sanitized.filter((item) => item.status === "accepted").length,
    expired_count: sanitized.filter((item) => item.status === "expired").length,
    revoked_count: sanitized.filter((item) => item.status === "revoked").length
  };
}

export async function createWorkspaceInvitation({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  registryPath = invitationsPath(rootDir),
  email,
  name = "",
  tenantSlug,
  role = "analyst",
  scopes,
  ttlMinutes = DEFAULT_INVITE_TTL_MINUTES,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  registryPath?: string;
  email: string;
  name?: string;
  tenantSlug: string;
  role?: string;
  scopes?: string[];
  ttlMinutes?: number;
  actor?: string;
  now?: string;
}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedTenant = normalizeTenantSlug(tenantSlug);
  const normalizedRole = normalizeRole(role);
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  if (!config.tenants.some((tenant: any) => tenant.slug === normalizedTenant)) {
    throw new Error(`Unknown tenant ${normalizedTenant}.`);
  }
  const boundedTtlMinutes = normalizeTtlMinutes(ttlMinutes);
  const inviteToken = makeInviteToken();
  const tokenHash = inviteTokenHash(inviteToken);
  const invitation = {
    id: makeId("invite", { normalizedEmail, normalizedTenant, normalizedRole, tokenHash, now }),
    email: normalizedEmail,
    name: String(name || normalizedEmail),
    tenant_slug: normalizedTenant,
    role: normalizedRole,
    scopes: scopes?.length ? scopes : undefined,
    invite_token_hash: tokenHash,
    created_at: now,
    expires_at: expiresAt(now, boundedTtlMinutes),
    accepted_at: "",
    accepted_principal_id: "",
    accepted_session_id: "",
    revoked_at: "",
    invited_by: actor,
    raw_invite_token_stored: false,
    raw_session_token_stored: false
  };
  const registry = await loadInvitationRegistry({ rootDir, registryPath, now });
  const saved = await saveInvitationRegistry(rootDir, {
    ...registry,
    invitations: [
      ...registry.invitations,
      invitation
    ]
  }, registryPath, now);
  await appendOnboardingEvent({
    rootDir,
    eventType: "workspace_invitation_created",
    actor,
    payload: {
      invitation_id: invitation.id,
      email: invitation.email,
      tenant_slug: invitation.tenant_slug,
      role: invitation.role,
      expires_at: invitation.expires_at
    },
    now
  });
  return {
    invitation: sanitizeInvitation(invitation, now),
    invite_token: inviteToken,
    invite_token_returned_once: true,
    raw_invite_token_stored: false,
    raw_session_token_stored: false,
    invitation_count: saved.invitations.length,
    registry_path: registryPath,
    events_path: onboardingEventsPath(rootDir)
  };
}

export async function acceptWorkspaceInvitation({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  registryPath = invitationsPath(rootDir),
  inviteToken,
  email,
  name,
  sessionTtlMinutes = DEFAULT_SESSION_TTL_MINUTES,
  actor = "workspace_invitee",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  registryPath?: string;
  inviteToken: string;
  email?: string;
  name?: string;
  sessionTtlMinutes?: number;
  actor?: string;
  now?: string;
}) {
  const rawInviteToken = String(inviteToken ?? "").trim();
  if (!rawInviteToken.startsWith("pinv_")) {
    throw new Error("Invitation token is required.");
  }
  const registry = await loadInvitationRegistry({ rootDir, registryPath, now });
  const tokenHash = inviteTokenHash(rawInviteToken);
  const invitation = registry.invitations.find((item: any) => item.invite_token_hash === tokenHash);
  if (!invitation) {
    const error: any = new Error("Invitation token is unknown.");
    error.statusCode = 403;
    throw error;
  }
  if (invitation.revoked_at) {
    const error: any = new Error("Invitation has been revoked.");
    error.statusCode = 403;
    throw error;
  }
  if (invitation.accepted_at) {
    const error: any = new Error("Invitation has already been accepted.");
    error.statusCode = 409;
    throw error;
  }
  if (new Date(invitation.expires_at).getTime() <= new Date(now).getTime()) {
    const error: any = new Error("Invitation has expired.");
    error.statusCode = 403;
    throw error;
  }
  const acceptedEmail = email ? normalizeEmail(email) : invitation.email;
  if (acceptedEmail !== invitation.email) {
    const error: any = new Error("Invitation email does not match.");
    error.statusCode = 403;
    throw error;
  }
  const principal = await registerIdentityPrincipal({
    rootDir,
    configPath,
    email: invitation.email,
    name: name ? String(name) : invitation.name,
    tenantSlug: invitation.tenant_slug,
    role: invitation.role,
    scopes: invitation.scopes,
    actor,
    now
  });
  const session = await issueIdentitySession({
    rootDir,
    email: invitation.email,
    tenantSlug: invitation.tenant_slug,
    ttlMinutes: normalizeTtlMinutes(sessionTtlMinutes, DEFAULT_SESSION_TTL_MINUTES),
    actor,
    now
  });
  const acceptedInvitation = {
    ...invitation,
    accepted_at: now,
    accepted_principal_id: principal.principal.id,
    accepted_session_id: session.session.id
  };
  await saveInvitationRegistry(rootDir, {
    ...registry,
    invitations: registry.invitations.map((item: any) =>
      item.id === invitation.id ? acceptedInvitation : item
    )
  }, registryPath, now);
  await appendOnboardingEvent({
    rootDir,
    eventType: "workspace_invitation_accepted",
    actor,
    payload: {
      invitation_id: acceptedInvitation.id,
      principal_id: principal.principal.id,
      session_id: session.session.id,
      email: acceptedInvitation.email,
      tenant_slug: acceptedInvitation.tenant_slug,
      role: acceptedInvitation.role
    },
    now
  });
  return {
    invitation: sanitizeInvitation(acceptedInvitation, now),
    principal: principal.principal,
    session: session.session,
    session_token: session.session_token,
    session_token_returned_once: true,
    raw_invite_token_stored: false,
    raw_session_token_stored: false,
    registry_path: registryPath,
    directory_path: session.directory_path
  };
}

export async function revokeWorkspaceInvitation({
  rootDir = "managed-saas",
  registryPath = invitationsPath(rootDir),
  invitationId,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  registryPath?: string;
  invitationId: string;
  actor?: string;
  now?: string;
}) {
  const registry = await loadInvitationRegistry({ rootDir, registryPath, now });
  const invitation = registry.invitations.find((item: any) => item.id === invitationId);
  if (!invitation) throw new Error(`Unknown invitation ${invitationId}.`);
  const revoked = {
    ...invitation,
    revoked_at: invitation.revoked_at || now
  };
  await saveInvitationRegistry(rootDir, {
    ...registry,
    invitations: registry.invitations.map((item: any) => item.id === invitation.id ? revoked : item)
  }, registryPath, now);
  await appendOnboardingEvent({
    rootDir,
    eventType: "workspace_invitation_revoked",
    actor,
    payload: {
      invitation_id: invitation.id,
      email: invitation.email,
      tenant_slug: invitation.tenant_slug
    },
    now
  });
  return {
    invitation: sanitizeInvitation(revoked, now),
    revoked: true,
    raw_invite_token_stored: false,
    registry_path: registryPath
  };
}

export async function workspaceOnboardingStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  registryPath = invitationsPath(rootDir),
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  registryPath?: string;
  now?: string;
} = {}) {
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  const registry = await loadInvitationRegistry({ rootDir, registryPath, now });
  const events = parseJsonLines(await readTextIfExists(onboardingEventsPath(rootDir)));
  const identity = await identityStatus({ rootDir, configPath, now });
  const summary = summarizeInvitations(registry.invitations, now);
  const sanitized = registry.invitations.map((invitation: any) => sanitizeInvitation(invitation, now));
  const tenantSet = new Set(config.tenants.map((tenant: any) => tenant.slug));
  const invitationsHashOnly = registry.invitations.every((invitation: any) =>
    Boolean(invitation.invite_token_hash) &&
    invitation.raw_invite_token_stored === false &&
    !("invite_token" in invitation) &&
    !("session_token" in invitation)
  );
  const tenantsValid = registry.invitations.every((invitation: any) => tenantSet.has(invitation.tenant_slug));
  const acceptedInvitesHavePrincipals = sanitized
    .filter((invitation: any) => invitation.status === "accepted")
    .every((invitation: any) => Boolean(invitation.accepted_principal_id && invitation.accepted_session_id));
  const controls = [
    {
      id: "managed_tenant_available",
      passed: config.tenants.length > 0,
      severity: "required",
      detail: "At least one managed SaaS tenant can receive invitations."
    },
    {
      id: "identity_foundation_ready",
      passed: identity.status === "ready_for_identity_foundation",
      severity: "required",
      detail: "Accepted invitees become identity principals with hash-only sessions."
    },
    {
      id: "invitations_hash_only",
      passed: invitationsHashOnly,
      severity: "required",
      detail: "Persisted invitations contain token hashes only."
    },
    {
      id: "invitation_tenants_valid",
      passed: tenantsValid,
      severity: "required",
      detail: "Every invitation points at a known tenant."
    },
    {
      id: "accepted_invites_bind_principals",
      passed: acceptedInvitesHavePrincipals,
      severity: "required",
      detail: "Accepted invitations record the principal and session IDs, not raw bearer values."
    },
    {
      id: "raw_invite_token_storage_blocked",
      passed: registry.token_policy?.raw_invite_token_storage_allowed === false,
      severity: "required",
      detail: "Workspace invite policy blocks raw invite token storage."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    registry_path: registryPath,
    events_path: onboardingEventsPath(rootDir),
    status: requiredFailures.length === 0 ? "ready_for_workspace_user_onboarding" : "blocked",
    summary: {
      ...summary,
      principal_count: identity.summary.principal_count,
      active_session_count: identity.summary.active_session_count,
      event_count: events.length,
      raw_invite_token_stored: false,
      raw_session_token_stored: false,
      required_failure_count: requiredFailures.length
    },
    controls,
    invitations: sanitized,
    latest_events: events.slice(-8).reverse()
  };
}
