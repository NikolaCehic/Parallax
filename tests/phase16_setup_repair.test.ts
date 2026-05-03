import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildHostedConsoleHtml } from "../src/app/hosted_console.js";
import {
  hostedApiTokenHash,
  startHostedServer
} from "../src/saas/server.js";
import {
  applyConnectorRepair,
  connectorRepairStatus
} from "../src/saas/setup_repair.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-03T10:00:00Z";
const TOKEN = "phase-16-hosted-token";

async function apiJson(baseUrl: string, route: string, {
  method = "GET",
  token = TOKEN,
  body
}: {
  method?: string;
  token?: string;
  body?: any;
} = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  return {
    status: response.status,
    body: text ? JSON.parse(text) : {}
  };
}

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

test("Phase 16 guided connector repair converges through hosted API and renders in the console without secrets", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase16-api-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    const tokenHash = hostedApiTokenHash(TOKEN);
    const initial = await connectorRepairStatus({
      rootDir,
      configPath,
      apiTokenHash: tokenHash,
      now: NOW
    });
    assert.equal(initial.status, "blocked");
    assert.equal(initial.next_action.id, "control_plane_scaffold");
    assert.equal(JSON.stringify(initial).includes("secret://"), false);

    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0,
      now: NOW
    });

    const hostedInitial = await apiJson(started.url, "/api/setup-repair?tenant=alpha&symbol=NVDA");
    assert.equal(hostedInitial.status, 200);
    assert.equal(hostedInitial.body.next_action.id, "control_plane_scaffold");

    const applied: string[] = [];
    let status = hostedInitial.body;
    for (let index = 0; index < 6 && status.next_action; index += 1) {
      const result = await apiJson(started.url, "/api/setup-repair", {
        method: "POST",
        body: {
          action_id: "next",
          tenant_slug: "alpha",
          symbol: "NVDA",
          now: NOW
        }
      });
      assert.equal(result.status, 201);
      applied.push(result.body.action_id);
      status = result.body.repair_status;
    }
    assert.deepEqual(applied, [
      "control_plane_scaffold",
      "identity_bootstrap",
      "storage_bootstrap",
      "data_vendor_bootstrap",
      "llm_provider_bootstrap"
    ]);
    assert.equal(status.status, "ready_for_guided_connector_setup");
    assert.equal(status.statuses.data_vendor, "ready_for_external_data_vendor_boundary");
    assert.equal(status.statuses.llm_provider, "ready_for_external_llm_provider_boundary");
    assert.equal(status.summary.raw_secret_stored, false);
    assert.equal(status.summary.direct_external_network_connection, false);

    const control = await apiJson(started.url, "/api/control-plane");
    assert.equal(control.status, 200);
    assert.equal(control.body.setup_repair.status, "ready_for_guided_connector_setup");

    const html = await buildHostedConsoleHtml({
      rootDir,
      configPath,
      apiTokenHash: tokenHash,
      now: NOW
    });
    assert.match(html, /Guided Repair/);
    assert.match(html, /Apply next repair/);
    assert.match(html, /\/api\/setup-repair/);
    assert.match(html, /setup-repair-apply/);
    assert.match(html, /ready_for_guided_connector_setup/);
    assert.equal(html.includes(TOKEN), false);
    assert.equal(html.includes("secret://"), false);
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 16 CLI exposes human-readable guided repair status and apply workflow", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase16-cli-"));
  try {
    const common = [
      "--root-dir", rootDir,
      "--api-token", TOKEN,
      "--tenant", "alpha",
      "--symbol", "NVDA",
      "--now", NOW
    ];
    const initial = runCli(["setup-repair-status", ...common]);
    assert.match(initial, /Parallax Guided Connector Repair/);
    assert.match(initial, /Next Action/);
    assert.match(initial, /control_plane_scaffold/);
    assert.match(initial, /Raw secret stored: no/);

    const applied: string[] = [];
    for (let index = 0; index < 5; index += 1) {
      const output = runCli(["setup-repair-apply", ...common, "--action", "next"]);
      assert.match(output, /Parallax Guided Repair Applied/);
      const line = output.split("\n").find((item) => item.startsWith("Action: "));
      assert.ok(line);
      applied.push(line.replace("Action: ", "").trim());
    }
    assert.deepEqual(applied, [
      "control_plane_scaffold",
      "identity_bootstrap",
      "storage_bootstrap",
      "data_vendor_bootstrap",
      "llm_provider_bootstrap"
    ]);

    const finalJson = JSON.parse(runCli(["setup-repair-status", ...common, "--json"]));
    assert.equal(finalJson.status, "ready_for_guided_connector_setup");
    assert.equal(finalJson.summary.complete_count, 5);
    assert.equal(finalJson.summary.raw_secret_stored, false);
    assert.equal(finalJson.summary.direct_external_network_connection, false);
    assert.equal(JSON.stringify(finalJson).includes("secret://"), false);
    assert.equal(JSON.stringify(finalJson).includes(TOKEN), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
