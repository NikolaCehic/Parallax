import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  betaDeploymentReadiness,
  betaStatus,
  exportBetaDeploymentPackage,
  initializeBetaDeployment
} from "../src/beta/deployment.js";
import { startBetaServer } from "../src/beta/server.js";

const CLI = "dist/src/cli/parallax.js";
const TOKEN = "phase8-secret-token";

function runCli(args: string[]) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PARALLAX_PYTHON: process.env.PARALLAX_PYTHON ?? "python3"
    }
  });
}

test("Phase 8 beta deployment exposes authenticated API, readiness, analysis, dashboard, and export package", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase8-"));
  const configPath = path.join(auditDir, "beta-deployment.json");
  let server: Awaited<ReturnType<typeof startBetaServer>> | undefined;
  try {
    const initialized = await initializeBetaDeployment({
      auditDir,
      configPath,
      workspaceName: "Phase Eight Beta",
      apiToken: TOKEN,
      publicBaseUrl: "http://127.0.0.1:0",
      now: "2026-05-01T17:00:00Z"
    });
    assert.equal(initialized.config.api.raw_token_stored, false);
    assert.ok(initialized.config.api.token_hash);
    assert.equal("api_token" in initialized.config.api, false);

    const readiness = await betaDeploymentReadiness({
      auditDir,
      configPath,
      now: "2026-05-01T17:01:00Z"
    });
    assert.equal(readiness.status, "ready_for_local_beta");
    assert.equal(readiness.summary.production_submission_count, 0);
    assert.ok(readiness.controls.some((control: any) => control.id === "api_auth" && control.passed));
    assert.ok(readiness.warnings.some((control: any) => control.id === "external_market_data_disabled"));

    server = await startBetaServer({
      auditDir,
      configPath,
      host: "127.0.0.1",
      port: 0
    });

    const health = await fetch(`${server.url}/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).direct_live_broker_connection, false);

    const unauthorized = await fetch(`${server.url}/api/status`);
    assert.equal(unauthorized.status, 401);

    const analyzed = await fetch(`${server.url}/api/analyze`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        symbol: "NVDA",
        horizon: "swing",
        thesis: "phase eight beta API analysis",
        ceiling: "watchlist",
        now: "2026-05-01T17:02:00Z"
      })
    });
    assert.equal(analyzed.status, 201);
    const analyzedBody: any = await analyzed.json();
    assert.ok(analyzedBody.dossier_id.startsWith("dos_"));

    const status = await fetch(`${server.url}/api/status`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(status.status, 200);
    const statusBody: any = await status.json();
    assert.equal(statusBody.library_summary.dossier_count, 1);
    assert.equal(statusBody.partner_execution_summary.production_submission_count, 0);

    const library = await fetch(`${server.url}/api/library`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(library.status, 200);
    assert.equal((await library.json() as any).entries.length, 1);

    const dashboard = await fetch(`${server.url}/dashboard`, {
      headers: { authorization: `Bearer ${TOKEN}` }
    });
    assert.equal(dashboard.status, 200);
    assert.match(await dashboard.text(), /Parallax Local Alpha/);

    const exported = await exportBetaDeploymentPackage({
      auditDir,
      configPath,
      out: path.join(auditDir, "beta-package.json")
    });
    assert.equal(exported.readiness_status, "ready_for_local_beta");
    assert.equal(exported.dossier_count, 1);
    const packageText = await readFile(exported.out, "utf8");
    assert.match(packageText, /ready_for_local_beta/);
  } finally {
    if (server) await server.close();
    await rm(auditDir, { recursive: true, force: true });
  }
});

test("Phase 8 CLI exposes beta init, readiness, status, and export commands", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase8-cli-"));
  try {
    const initialized = runCli([
      "beta-init",
      "--audit-dir", auditDir,
      "--workspace-name", "CLI Beta Desk",
      "--api-token", TOKEN,
      "--now", "2026-05-01T17:00:00Z"
    ]);
    assert.match(initialized, /Parallax Beta Deployment/);
    assert.doesNotMatch(initialized, new RegExp(TOKEN));

    const readiness = runCli([
      "beta-readiness",
      "--audit-dir", auditDir,
      "--now", "2026-05-01T17:01:00Z"
    ]);
    assert.match(readiness, /ready_for_local_beta/);
    assert.match(readiness, /api_auth/);

    const statusJson = runCli([
      "beta-status",
      "--audit-dir", auditDir,
      "--json"
    ]);
    const status = JSON.parse(statusJson);
    assert.equal(status.readiness.status, "ready_for_local_beta");

    const exported = runCli([
      "beta-export",
      "--audit-dir", auditDir,
      "--out", path.join(auditDir, "beta-export.json")
    ]);
    assert.match(exported, /Parallax Beta Export/);
    assert.match(exported, /ready_for_local_beta/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
