import http from "node:http";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeThesis, readAuditBundle, replayAuditBundle } from "../index.js";
import { writeDashboard, buildDashboardHtml } from "../app/dashboard.js";
import { dossierToMarkdown } from "../render.js";
import { listLibraryEntries, upsertLibraryEntry } from "../library/store.js";
import { buildGovernanceReport } from "../team/governance.js";
import { partnerExecutionReport } from "../execution/partner.js";
import {
  betaDeploymentReadiness,
  betaStatus,
  defaultBetaConfigPath,
  loadBetaDeploymentConfig,
  verifyBetaToken
} from "./deployment.js";

function jsonResponse(res: http.ServerResponse, status: number, body: any, extraHeaders: Record<string, string> = {}) {
  const text = JSON.stringify(body, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  res.end(`${text}\n`);
}

function textResponse(res: http.ServerResponse, status: number, body: string, contentType = "text/plain; charset=utf-8") {
  res.writeHead(status, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  res.end(body);
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

function withCors(res: http.ServerResponse) {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, OPTIONS");
}

export function createBetaRequestHandler({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir),
  dataDir = "fixtures"
}: {
  auditDir?: string;
  configPath?: string;
  dataDir?: string;
} = {}) {
  return async function betaRequestHandler(req: http.IncomingMessage, res: http.ServerResponse) {
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
          service: "parallax-beta",
          direct_live_broker_connection: false
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/readyz") {
        const readiness = await betaDeploymentReadiness({ auditDir, configPath });
        jsonResponse(res, readiness.status === "ready_for_local_beta" ? 200 : 503, readiness);
        return;
      }

      const config = await loadBetaDeploymentConfig({ auditDir, configPath });
      if (!verifyBetaToken(config, bearerToken(req))) {
        jsonResponse(res, 401, {
          error: "unauthorized",
          message: "Provide Authorization: Bearer <beta_api_token>."
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/status") {
        jsonResponse(res, 200, await betaStatus({ auditDir, configPath }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/library") {
        jsonResponse(res, 200, await listLibraryEntries({ auditDir }));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/governance") {
        jsonResponse(res, 200, await buildGovernanceReport(auditDir));
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/partner") {
        jsonResponse(res, 200, await partnerExecutionReport(auditDir));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/analyze") {
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
          auditDir,
          now: body.now ? String(body.now) : undefined,
          councilMode: String(body.council_mode ?? "deterministic"),
          llmScenario: String(body.llm_scenario ?? "safe")
        });
        const auditPath = path.join(auditDir, `${dossier.id}.json`);
        const markdownPath = path.join(auditDir, `${dossier.id}.md`);
        await writeFile(markdownPath, dossierToMarkdown(dossier));
        await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });
        jsonResponse(res, 201, {
          dossier_id: dossier.id,
          action_class: dossier.decision_packet.action_class,
          thesis_state: dossier.lifecycle.state,
          audit_path: auditPath,
          markdown_path: markdownPath
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/replay") {
        const audit = url.searchParams.get("audit");
        if (!audit) {
          jsonResponse(res, 400, { error: "bad_request", message: "audit query parameter is required." });
          return;
        }
        const bundle = await readAuditBundle(audit);
        jsonResponse(res, 200, replayAuditBundle(bundle));
        return;
      }

      if (req.method === "GET" && url.pathname === "/dashboard") {
        const html = await buildDashboardHtml({ auditDir });
        textResponse(res, 200, html, "text/html; charset=utf-8");
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/dashboard/write") {
        const body = await readJsonBody(req);
        const out = String(body.out ?? path.join(auditDir, "parallax-beta-dashboard.html"));
        jsonResponse(res, 200, await writeDashboard({ auditDir, out }));
        return;
      }

      jsonResponse(res, 404, { error: "not_found", path: url.pathname });
    } catch (error: any) {
      jsonResponse(res, 500, {
        error: "internal_error",
        message: error.message
      });
    }
  };
}

export function createBetaServer(options: {
  auditDir?: string;
  configPath?: string;
  dataDir?: string;
} = {}) {
  return http.createServer(createBetaRequestHandler(options));
}

export async function startBetaServer({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir),
  dataDir = "fixtures",
  host = "127.0.0.1",
  port = 8787
}: {
  auditDir?: string;
  configPath?: string;
  dataDir?: string;
  host?: string;
  port?: number;
} = {}) {
  const server = createBetaServer({ auditDir, configPath, dataDir });
  await new Promise<void>((resolve) => server.listen(port, host, resolve));
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    server,
    host,
    port: actualPort,
    url: `http://${host}:${actualPort}`,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    )
  };
}
