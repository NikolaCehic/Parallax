import { isoNow } from "../core/ids.js";
import { managedSaasConfigPath } from "./managed.js";
import {
  identityStatus,
  updateIdentityMembershipRole,
  updateIdentityPrincipalProfile,
  verifyIdentitySession
} from "./identity.js";

function publicPrincipal(principal: any) {
  return {
    id: principal.id,
    email: principal.email,
    name: principal.name,
    status: principal.status,
    platform_admin: principal.platform_admin === true,
    memberships: principal.memberships ?? [],
    preferences: principal.preferences ?? {}
  };
}

export async function accountProfile({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  sessionToken,
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  sessionToken: string;
  now?: string;
}) {
  const verified = await verifyIdentitySession({ rootDir, sessionToken, now });
  const identity = await identityStatus({ rootDir, configPath, now });
  const principal = identity.principals.find((item: any) => item.email === verified.principal.email);
  if (!principal) throw new Error(`Unknown active principal ${verified.principal.email}.`);
  const activeMembership = (principal.memberships ?? []).find((membership: any) =>
    membership.tenant_slug === verified.session.tenant_slug
  );
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    status: "ready_for_account_self_service",
    profile: publicPrincipal(principal),
    session: {
      id: verified.session.id,
      tenant_slug: verified.session.tenant_slug,
      role: verified.session.role,
      scopes: verified.session.scopes,
      expires_at: verified.session.expires_at,
      raw_session_token_stored: false
    },
    active_membership: activeMembership ?? null,
    controls: [
      {
        id: "authenticated_identity_session",
        passed: true,
        severity: "required",
        detail: "Account settings are backed by a valid identity session."
      },
      {
        id: "raw_session_token_hidden",
        passed: true,
        severity: "required",
        detail: "Account profile responses never include the raw bearer token."
      }
    ],
    raw_session_token_stored: false
  };
}

export async function updateAccountProfile({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  sessionToken,
  name,
  defaultTenantSlug = "",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  sessionToken: string;
  name?: string;
  defaultTenantSlug?: string;
  now?: string;
}) {
  const verified = await verifyIdentitySession({ rootDir, sessionToken, now });
  await updateIdentityPrincipalProfile({
    rootDir,
    configPath,
    email: verified.principal.email,
    name,
    defaultTenantSlug,
    actor: verified.principal.email,
    now
  });
  return accountProfile({ rootDir, configPath, sessionToken, now });
}

export async function setWorkspaceMemberRole({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  email,
  tenantSlug,
  role,
  scopes,
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  email: string;
  tenantSlug: string;
  role: string;
  scopes?: string[];
  actor?: string;
  now?: string;
}) {
  const result = await updateIdentityMembershipRole({
    rootDir,
    configPath,
    email,
    tenantSlug,
    role,
    scopes,
    actor,
    now
  });
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    status: "membership_role_updated",
    principal: result.principal,
    membership: result.membership,
    updated_session_count: result.updated_session_count,
    raw_session_token_stored: false
  };
}
