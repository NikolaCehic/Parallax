import http from "node:http";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeThesis } from "../index.js";
import { buildHostedConsoleHtml } from "../app/hosted_console.js";
import { stableHash, isoNow } from "../core/ids.js";
import { listLibraryEntries, upsertLibraryEntry } from "../library/store.js";
import { dossierToMarkdown } from "../render.js";
import { providerValidationPath, validateProviderContracts } from "../providers/validation.js";
import { managedSaasConfigPath, managedSaasStatus } from "./managed.js";
import {
  identityStatus,
  issueIdentitySession,
  verifyIdentitySession
} from "./identity.js";
import {
  appendTenantEvent,
  normalizeTenantSlug,
  readTenantEvents,
  readTenantState,
  resolveTenant,
  saveTenantStateValue,
  tenantPersistenceStatus
} from "./persistence.js";
import {
  createStorageCheckpoint,
  durableStorageStatus,
  readDurableObject,
  writeDurableObject
} from "./storage.js";
import {
  dataVendorStatus,
  importDataVendorPack
} from "./data_vendor.js";
import {
  llmProviderStatus,
  runLLMProviderReplayAnalysis
} from "./llm_provider.js";
import {
  applyConnectorRepair,
  connectorRepairStatus
} from "./setup_repair.js";

function jsonResponse(res: http.ServerResponse, status: number, body: any, extraHeaders: Record<string, string> = {}) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  res.end(`${text}\n`);
}

function textResponse(res: http.ServerResponse, status: number, body: string, contentType = "text/html; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
}

function withCors(res: http.ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type, x-parallax-tenant");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
}

function bearerToken(req: http.IncomingMessage) {
  const header = req.headers.authorization ?? "";
  const [scheme, token] = String(header).split(" ");
  return scheme?.toLowerCase() === "bearer" ? token ?? "" : "";
}

async function readJsonBody(req: http.IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function routeParts(pathname: string) {
  return pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part));
}

function requestError(statusCode: number, message: string) {
  const error: any = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function hostedApiTokenHash(token: string) {
  return stableHash({ token, purpose: "parallax_hosted_api_token" });
}

export function verifyHostedApiToken(tokenHash: string, token: string) {
  return Boolean(tokenHash) && Boolean(token) && hostedApiTokenHash(token) === tokenHash;
}

function requireTenantHeader(req: http.IncomingMessage, tenantSlug: string) {
  const header = req.headers["x-parallax-tenant"];
  const headerValue = Array.isArray(header) ? header[0] : header;
  if (!headerValue) {
    throw requestError(400, "x-parallax-tenant header is required for tenant-scoped routes.");
  }
  const normalizedHeader = normalizeTenantSlug(String(headerValue));
  const normalizedPath = normalizeTenantSlug(tenantSlug);
  if (normalizedHeader !== normalizedPath) {
    throw requestError(403, `Tenant header ${normalizedHeader} cannot access tenant ${normalizedPath}.`);
  }
  return normalizedPath;
}

function assertTenantScopedDataDir(tenant: any, dataDir: string) {
  const tenantRoot = path.resolve(tenant.tenant_dir);
  const target = path.resolve(dataDir);
  if (target !== tenantRoot && !target.startsWith(`${tenantRoot}${path.sep}`)) {
    throw requestError(403, "Tenant analysis data_dir must stay inside the tenant workspace.");
  }
}

async function authenticateRequest({
  req,
  rootDir,
  apiTokenHash,
  now
}: {
  req: http.IncomingMessage;
  rootDir: string;
  apiTokenHash: string;
  now?: string;
}) {
  const token = bearerToken(req);
  if (verifyHostedApiToken(apiTokenHash, token)) {
    return {
      kind: "api_token",
      token,
      principal: {
        id: "hosted_api_token",
        email: "service-account@local.parallax",
        platform_admin: true
      }
    };
  }
  if (!token) return null;
  try {
    const identity = await verifyIdentitySession({ rootDir, sessionToken: token, now });
    return {
      kind: "identity_session",
      token,
      principal: identity.principal,
      session: identity.session
    };
  } catch {
    return null;
  }
}

async function requireAuthScope({
  auth,
  rootDir,
  tenantSlug = "",
  scope,
  now
}: {
  auth: any;
  rootDir: string;
  tenantSlug?: string;
  scope: string;
  now?: string;
}) {
  if (auth?.kind === "api_token") return auth;
  if (!auth) throw requestError(401, "Provide Authorization: Bearer <hosted_api_token_or_identity_session>.");
  const identity = await verifyIdentitySession({
    rootDir,
    sessionToken: auth.token,
    tenantSlug,
    requiredScope: scope,
    now
  });
  return {
    ...auth,
    principal: identity.principal,
    session: identity.session
  };
}

export async function hostedApiStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  apiTokenHash = "",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  apiTokenHash?: string;
  now?: string;
} = {}) {
  const providerValidation = await validateProviderContracts({
    rootDir,
    configPath,
    now
  });
  const persistence = await tenantPersistenceStatus({ rootDir, configPath, now });
  const controls = [
    {
      id: "api_auth_configured",
      passed: Boolean(apiTokenHash),
      severity: "required",
      detail: "Hosted API bearer auth token hash is configured at runtime."
    },
    {
      id: "provider_contracts_ready",
      passed: providerValidation.status === "ready_for_provider_contract_beta",
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
    },
    {
      id: "no_production_providers",
      passed: providerValidation.summary.production_provider_count === 0,
      severity: "required",
      detail: "No provider manifest is enabled for production."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    status: requiredFailures.length === 0 ? "ready_for_hosted_multi_tenant_api" : "blocked",
    summary: {
      tenant_count: persistence.summary.tenant_count,
      provider_count: providerValidation.summary.provider_count,
      required_failure_count: requiredFailures.length,
      total_dossier_count: persistence.summary.total_dossier_count,
      raw_token_stored: false,
      direct_live_broker_connection: false
    },
    controls,
    provider_validation: providerValidation,
    tenant_persistence: persistence
  };
}

export async function hostedFoundationStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  apiTokenHash = "",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  apiTokenHash?: string;
  now?: string;
} = {}) {
  const hosted = await hostedApiStatus({ rootDir, configPath, apiTokenHash, now });
  const identity = await identityStatus({ rootDir, configPath, now });
  const storage = await durableStorageStatus({ rootDir, configPath, now });
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
    },
    {
      id: "no_raw_tokens_or_secrets",
      passed: hosted.summary.raw_token_stored === false &&
        identity.summary.raw_session_token_stored === false &&
        storage.summary.raw_secret_stored === false,
      severity: "required",
      detail: "No raw API tokens, identity sessions, or storage secrets are persisted."
    },
    {
      id: "no_live_external_execution_or_storage",
      passed: hosted.summary.direct_live_broker_connection === false &&
        storage.summary.direct_cloud_storage_connection === false,
      severity: "required",
      detail: "Phase 12 remains a foundation contract, not live execution or production cloud storage."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    status: requiredFailures.length === 0 ? "ready_for_identity_storage_foundation" : "blocked",
    summary: {
      required_failure_count: requiredFailures.length,
      tenant_count: hosted.summary.tenant_count,
      provider_count: hosted.summary.provider_count,
      principal_count: identity.summary.principal_count,
      active_session_count: identity.summary.active_session_count,
      storage_object_count: storage.summary.object_count,
      storage_checkpoint_count: storage.summary.checkpoint_count,
      raw_token_stored: false,
      raw_session_token_stored: false,
      raw_secret_stored: false,
      direct_live_broker_connection: false,
      direct_cloud_storage_connection: false
    },
    controls,
    hosted_api: hosted,
    identity,
    durable_storage: storage
  };
}

async function tenantFromRoute({
  req,
  rootDir,
  configPath,
  tenantSlug
}: {
  req: http.IncomingMessage;
  rootDir: string;
  configPath: string;
  tenantSlug: string;
}) {
  const slug = requireTenantHeader(req, tenantSlug);
  return resolveTenant({ rootDir, configPath, tenantSlug: slug });
}

export function createHostedRequestHandler({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  dataDir = "fixtures",
  apiTokenHash = "",
  now
}: {
  rootDir?: string;
  configPath?: string;
  dataDir?: string;
  apiTokenHash?: string;
  now?: string;
} = {}) {
  return async function hostedRequestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
    withCors(res);
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (req.method === "GET" && url.pathname === "/healthz") {
        jsonResponse(res, 200, {
          status: "ok",
          service: "parallax-hosted",
          raw_token_stored: false,
          direct_live_broker_connection: false
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/readyz") {
        const readiness = await hostedApiStatus({ rootDir, configPath, apiTokenHash, now });
        jsonResponse(res, readiness.status === "ready_for_hosted_multi_tenant_api" ? 200 : 503, readiness);
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/identity/sessions") {
        if (!verifyHostedApiToken(apiTokenHash, bearerToken(req))) {
          jsonResponse(res, 401, {
            error: "unauthorized",
            message: "Identity session issuance requires the hosted service API token."
          });
          return;
        }
        const body = await readJsonBody(req);
        if (!body.email) {
          jsonResponse(res, 400, { error: "bad_request", message: "email is required." });
          return;
        }
        const result = await issueIdentitySession({
          rootDir,
          email: String(body.email),
          tenantSlug: body.tenant_slug ? String(body.tenant_slug) : "",
          ttlMinutes: body.ttl_minutes ? Number(body.ttl_minutes) : undefined,
          actor: body.actor ? String(body.actor) : "hosted_api",
          now: body.now ? String(body.now) : undefined
        });
        jsonResponse(res, 201, result);
        return;
      }

      const auth = await authenticateRequest({ req, rootDir, apiTokenHash, now });
      if (!auth) {
        jsonResponse(res, 401, {
          error: "unauthorized",
          message: "Provide Authorization: Bearer <hosted_api_token_or_identity_session>."
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/control-plane") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, {
          hosted_api: await hostedApiStatus({ rootDir, configPath, apiTokenHash, now }),
          managed_saas: await managedSaasStatus({ rootDir, configPath, now }),
          identity: await identityStatus({ rootDir, configPath, now }),
          durable_storage: await durableStorageStatus({ rootDir, configPath, now }),
          data_vendor: await dataVendorStatus({ rootDir, configPath, now }),
          llm_provider: await llmProviderStatus({ rootDir, configPath, now }),
          setup_repair: await connectorRepairStatus({ rootDir, configPath, apiTokenHash, now })
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/setup-repair") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, await connectorRepairStatus({
          rootDir,
          configPath,
          apiTokenHash,
          tenantSlug: url.searchParams.get("tenant") ?? undefined,
          symbol: url.searchParams.get("symbol") ?? undefined,
          now
        }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/setup-repair") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:write" });
        const body = await readJsonBody(req);
        const result = await applyConnectorRepair({
          rootDir,
          configPath,
          apiTokenHash,
          actionId: String(body.action_id ?? "next"),
          tenantSlug: body.tenant_slug ? String(body.tenant_slug) : undefined,
          symbol: body.symbol ? String(body.symbol) : undefined,
          actor: body.actor ? String(body.actor) : "hosted_api",
          now: body.now ? String(body.now) : now
        });
        jsonResponse(res, 201, result);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/foundation") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        const status = await hostedFoundationStatus({ rootDir, configPath, apiTokenHash, now });
        jsonResponse(res, status.status === "ready_for_identity_storage_foundation" ? 200 : 503, status);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/identity/status") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, await identityStatus({ rootDir, configPath, now }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/storage/status") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, await durableStorageStatus({ rootDir, configPath, now }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/data-vendors/status") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, await dataVendorStatus({ rootDir, configPath, now }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/llm-providers/status") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, await llmProviderStatus({ rootDir, configPath, now }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/storage/checkpoints") {
        await requireAuthScope({ auth, rootDir, now, scope: "storage:checkpoint" });
        const body = await readJsonBody(req);
        const result = await createStorageCheckpoint({
          rootDir,
          configPath,
          tenantSlug: body.tenant_slug ? String(body.tenant_slug) : undefined,
          label: body.label ? String(body.label) : "api_checkpoint",
          actor: body.actor ? String(body.actor) : "hosted_api",
          now: body.now ? String(body.now) : undefined
        });
        jsonResponse(res, 201, result);
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/tenants") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        jsonResponse(res, 200, await tenantPersistenceStatus({ rootDir, configPath, now }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/console") {
        await requireAuthScope({ auth, rootDir, now, scope: "control_plane:read" });
        textResponse(res, 200, await buildHostedConsoleHtml({ rootDir, configPath, apiTokenHash, now }));
        return;
      }

      const parts = routeParts(url.pathname);
      if (parts[0] === "api" && parts[1] === "tenants" && parts[2]) {
        const tenantSlug = parts[2];
        const action = parts[3] ?? "status";
        const tenant = await tenantFromRoute({ req, rootDir, configPath, tenantSlug });

        if (req.method === "GET" && action === "status") {
          await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:read" });
          jsonResponse(res, 200, await tenantPersistenceStatus({
            rootDir,
            configPath,
            tenantSlug: tenant.tenant_slug,
            now
          }));
          return;
        }

        if (req.method === "GET" && action === "library") {
          await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:read" });
          jsonResponse(res, 200, await listLibraryEntries({ auditDir: tenant.audit_dir }));
          return;
        }

        if (req.method === "GET" && action === "state") {
          await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:read" });
          jsonResponse(res, 200, await readTenantState({ rootDir, configPath, tenantSlug: tenant.tenant_slug }));
          return;
        }

        if (req.method === "POST" && action === "state") {
          await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:write" });
          const body = await readJsonBody(req);
          if (!body.key) {
            jsonResponse(res, 400, { error: "bad_request", message: "key is required." });
            return;
          }
          const result = await saveTenantStateValue({
            rootDir,
            configPath,
            tenantSlug: tenant.tenant_slug,
            key: String(body.key),
            value: body.value ?? {},
            actor: body.actor ? String(body.actor) : "hosted_api",
            now: body.now ? String(body.now) : undefined
          });
          jsonResponse(res, 200, result);
          return;
        }

        if (req.method === "GET" && action === "events") {
          await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:read" });
          jsonResponse(res, 200, await readTenantEvents({ rootDir, configPath, tenantSlug: tenant.tenant_slug }));
          return;
        }

        if (action === "storage") {
          if (req.method === "GET") {
            await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "storage:read" });
            const key = url.searchParams.get("key");
            if (!key) {
              jsonResponse(res, 400, { error: "bad_request", message: "key query parameter is required." });
              return;
            }
            jsonResponse(res, 200, await readDurableObject({
              rootDir,
              tenantSlug: tenant.tenant_slug,
              key
            }));
            return;
          }
          if (req.method === "POST") {
            await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "storage:write" });
            const body = await readJsonBody(req);
            if (!body.key) {
              jsonResponse(res, 400, { error: "bad_request", message: "key is required." });
              return;
            }
            const result = await writeDurableObject({
              rootDir,
              configPath,
              tenantSlug: tenant.tenant_slug,
              key: String(body.key),
              value: body.value ?? {},
              actor: body.actor ? String(body.actor) : "hosted_api",
              now: body.now ? String(body.now) : undefined
            });
            jsonResponse(res, 201, result);
            return;
          }
        }

        if (action === "data-vendor") {
          if (req.method === "GET") {
            await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:read" });
            jsonResponse(res, 200, await dataVendorStatus({
              rootDir,
              configPath,
              tenantSlug: tenant.tenant_slug,
              now
            }));
            return;
          }
          if (req.method === "POST") {
            await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:write" });
            const body = await readJsonBody(req);
            if (!body.adapter_id || !body.symbol || !body.payload) {
              jsonResponse(res, 400, { error: "bad_request", message: "adapter_id, symbol, and payload are required." });
              return;
            }
            const result = await importDataVendorPack({
              rootDir,
              configPath,
              tenantSlug: tenant.tenant_slug,
              adapterId: String(body.adapter_id),
              symbol: String(body.symbol),
              payload: body.payload,
              actor: body.actor ? String(body.actor) : "hosted_api",
              now: body.now ? String(body.now) : undefined
            });
            jsonResponse(res, 201, result);
            return;
          }
        }

        if (action === "llm-provider") {
          if (req.method === "GET") {
            await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "tenant:read" });
            jsonResponse(res, 200, await llmProviderStatus({
              rootDir,
              configPath,
              tenantSlug: tenant.tenant_slug,
              now
            }));
            return;
          }
          if (req.method === "POST" && parts[4] === "analyze") {
            await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "analysis:create" });
            const body = await readJsonBody(req);
            if (!body.adapter_id || !body.symbol || !body.thesis) {
              jsonResponse(res, 400, { error: "bad_request", message: "adapter_id, symbol, and thesis are required." });
              return;
            }
            if (body.data_dir) assertTenantScopedDataDir(tenant, String(body.data_dir));
            const result = await runLLMProviderReplayAnalysis({
              rootDir,
              configPath,
              tenantSlug: tenant.tenant_slug,
              adapterId: String(body.adapter_id),
              symbol: String(body.symbol),
              horizon: String(body.horizon ?? "swing"),
              thesis: String(body.thesis),
              dataDir: String(body.data_dir ?? dataDir),
              actionCeiling: String(body.ceiling ?? "watchlist"),
              userClass: String(body.user_class ?? "research_team"),
              intendedUse: String(body.intended_use ?? "team_review"),
              scenario: String(body.scenario ?? "safe"),
              llmBudget: body.llm_budget,
              audit: true,
              auditDir: tenant.audit_dir,
              actor: body.actor ? String(body.actor) : "hosted_api",
              now: body.now ? String(body.now) : undefined
            });
            const auditPath = path.join(tenant.audit_dir, `${result.dossier.id}.json`);
            const markdownPath = path.join(tenant.audit_dir, `${result.dossier.id}.md`);
            await writeFile(markdownPath, dossierToMarkdown(result.dossier));
            await upsertLibraryEntry({
              auditDir: tenant.audit_dir,
              dossier: result.dossier,
              auditPath,
              markdownPath
            });
            await appendTenantEvent({
              rootDir,
              configPath,
              tenantSlug: tenant.tenant_slug,
              eventType: "tenant_llm_provider_analysis_created",
              actor: body.actor ? String(body.actor) : "hosted_api",
              payload: {
                run_id: result.run.id,
                dossier_id: result.dossier.id,
                symbol: result.dossier.symbol,
                council_eval_passed: result.run.council_eval_passed,
                action_class: result.dossier.decision_packet.action_class
              },
              now: body.now ? String(body.now) : undefined
            });
            jsonResponse(res, 201, {
              tenant_slug: tenant.tenant_slug,
              run: result.run,
              dossier_id: result.dossier.id,
              action_class: result.dossier.decision_packet.action_class,
              council_eval_passed: result.run.council_eval_passed,
              audit_path: auditPath,
              markdown_path: markdownPath
            });
            return;
          }
        }

        if (req.method === "POST" && action === "analyze") {
          await requireAuthScope({ auth, rootDir, now, tenantSlug: tenant.tenant_slug, scope: "analysis:create" });
          const body = await readJsonBody(req);
          if (!body.symbol || !body.thesis) {
            jsonResponse(res, 400, { error: "bad_request", message: "symbol and thesis are required." });
            return;
          }
          if (body.data_dir) assertTenantScopedDataDir(tenant, String(body.data_dir));
          const dossier = await analyzeThesis({
            symbol: String(body.symbol),
            horizon: String(body.horizon ?? "swing"),
            thesis: String(body.thesis),
            dataDir: String(body.data_dir ?? dataDir),
            actionCeiling: String(body.ceiling ?? "watchlist"),
            userClass: String(body.user_class ?? "research_team"),
            intendedUse: String(body.intended_use ?? "team_review"),
            audit: true,
            auditDir: tenant.audit_dir,
            now: body.now ? String(body.now) : undefined,
            councilMode: String(body.council_mode ?? "deterministic"),
            llmScenario: String(body.llm_scenario ?? "safe")
          });
          const auditPath = path.join(tenant.audit_dir, `${dossier.id}.json`);
          const markdownPath = path.join(tenant.audit_dir, `${dossier.id}.md`);
          await writeFile(markdownPath, dossierToMarkdown(dossier));
          await upsertLibraryEntry({
            auditDir: tenant.audit_dir,
            dossier,
            auditPath,
            markdownPath
          });
          await appendTenantEvent({
            rootDir,
            configPath,
            tenantSlug: tenant.tenant_slug,
            eventType: "tenant_analysis_created",
            actor: body.actor ? String(body.actor) : "hosted_api",
            payload: {
              dossier_id: dossier.id,
              symbol: dossier.symbol,
              action_class: dossier.decision_packet.action_class
            },
            now: body.now ? String(body.now) : undefined
          });
          jsonResponse(res, 201, {
            tenant_slug: tenant.tenant_slug,
            dossier_id: dossier.id,
            action_class: dossier.decision_packet.action_class,
            thesis_state: dossier.lifecycle.state,
            audit_path: auditPath,
            markdown_path: markdownPath
          });
          return;
        }
      }

      jsonResponse(res, 404, { error: "not_found", path: url.pathname });
    } catch (error: any) {
      const statusCode = error.statusCode ?? (
        /tenant slug|state key|storage object key|data vendor|llm provider|identity email|sensitive .*payload|unknown tenant|unknown durable object|json/i.test(error.message ?? "")
          ? 400
          : 500
      );
      jsonResponse(res, statusCode, {
        error: statusCode === 403 ? "forbidden" : statusCode === 400 ? "bad_request" : "internal_error",
        message: error.message
      });
    }
  };
}

export function createHostedServer(options: {
  rootDir?: string;
  configPath?: string;
  dataDir?: string;
  apiTokenHash?: string;
  now?: string;
} = {}) {
  return http.createServer(createHostedRequestHandler(options));
}

export async function startHostedServer({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  dataDir = "fixtures",
  apiToken,
  host = "127.0.0.1",
  port = 8888,
  now
}: {
  rootDir?: string;
  configPath?: string;
  dataDir?: string;
  apiToken: string;
  host?: string;
  port?: number;
  now?: string;
}) {
  if (!apiToken || apiToken.length < 8) {
    throw new Error("hosted-serve requires --api-token with at least 8 characters.");
  }
  const apiTokenHash = hostedApiTokenHash(apiToken);
  const server = createHostedServer({ rootDir, configPath, dataDir, apiTokenHash, now });
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    root_dir: rootDir,
    api_token_hash: apiTokenHash,
    raw_token_stored: false,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    )
  };
}
