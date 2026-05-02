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
  appendTenantEvent,
  normalizeTenantSlug,
  readTenantEvents,
  readTenantState,
  resolveTenant,
  saveTenantStateValue,
  tenantPersistenceStatus
} from "./persistence.js";

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
  apiTokenHash = ""
}: {
  rootDir?: string;
  configPath?: string;
  dataDir?: string;
  apiTokenHash?: string;
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
        const readiness = await hostedApiStatus({ rootDir, configPath, apiTokenHash });
        jsonResponse(res, readiness.status === "ready_for_hosted_multi_tenant_api" ? 200 : 503, readiness);
        return;
      }

      if (!verifyHostedApiToken(apiTokenHash, bearerToken(req))) {
        jsonResponse(res, 401, {
          error: "unauthorized",
          message: "Provide Authorization: Bearer <hosted_api_token>."
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/control-plane") {
        jsonResponse(res, 200, {
          hosted_api: await hostedApiStatus({ rootDir, configPath, apiTokenHash }),
          managed_saas: await managedSaasStatus({ rootDir, configPath })
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/tenants") {
        jsonResponse(res, 200, await tenantPersistenceStatus({ rootDir, configPath }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/console") {
        textResponse(res, 200, await buildHostedConsoleHtml({ rootDir, configPath }));
        return;
      }

      const parts = routeParts(url.pathname);
      if (parts[0] === "api" && parts[1] === "tenants" && parts[2]) {
        const tenantSlug = parts[2];
        const action = parts[3] ?? "status";
        const tenant = await tenantFromRoute({ req, rootDir, configPath, tenantSlug });

        if (req.method === "GET" && action === "status") {
          jsonResponse(res, 200, await tenantPersistenceStatus({
            rootDir,
            configPath,
            tenantSlug: tenant.tenant_slug
          }));
          return;
        }

        if (req.method === "GET" && action === "library") {
          jsonResponse(res, 200, await listLibraryEntries({ auditDir: tenant.audit_dir }));
          return;
        }

        if (req.method === "GET" && action === "state") {
          jsonResponse(res, 200, await readTenantState({ rootDir, configPath, tenantSlug: tenant.tenant_slug }));
          return;
        }

        if (req.method === "POST" && action === "state") {
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
          jsonResponse(res, 200, await readTenantEvents({ rootDir, configPath, tenantSlug: tenant.tenant_slug }));
          return;
        }

        if (req.method === "POST" && action === "analyze") {
          const body = await readJsonBody(req);
          if (!body.symbol || !body.thesis) {
            jsonResponse(res, 400, { error: "bad_request", message: "symbol and thesis are required." });
            return;
          }
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
        /tenant slug|state key|sensitive payload|unknown tenant|json/i.test(error.message ?? "")
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
} = {}) {
  return http.createServer(createHostedRequestHandler(options));
}

export async function startHostedServer({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  dataDir = "fixtures",
  apiToken,
  host = "127.0.0.1",
  port = 8888
}: {
  rootDir?: string;
  configPath?: string;
  dataDir?: string;
  apiToken: string;
  host?: string;
  port?: number;
}) {
  if (!apiToken || apiToken.length < 8) {
    throw new Error("hosted-serve requires --api-token with at least 8 characters.");
  }
  const apiTokenHash = hostedApiTokenHash(apiToken);
  const server = createHostedServer({ rootDir, configPath, dataDir, apiTokenHash });
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
