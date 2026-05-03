import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildHostedConsoleHtml } from "../src/app/hosted_console.js";
import {
  hostedApiTokenHash,
  startHostedServer
} from "../src/saas/server.js";
import { applyConnectorRepair } from "../src/saas/setup_repair.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-03T11:00:00Z";
const TOKEN = "phase-17-hosted-token";

async function setupReadyWorkspace(rootDir: string, configPath: string) {
  const apiTokenHash = hostedApiTokenHash(TOKEN);
  for (let index = 0; index < 5; index += 1) {
    await applyConnectorRepair({
      rootDir,
      configPath,
      apiTokenHash,
      actionId: "next",
      tenantSlug: "alpha",
      symbol: "NVDA",
      now: NOW
    });
  }
  return apiTokenHash;
}

async function apiJson(baseUrl: string, route: string, {
  method = "GET",
  token = TOKEN,
  tenant = "",
  body
}: {
  method?: string;
  token?: string;
  tenant?: string;
  body?: any;
} = {}) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (tenant) headers["x-parallax-tenant"] = tenant;
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

test("Phase 17 hosted onboarding creates hash-only invitations and accepts them without the service token", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase17-api-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    const tokenHash = await setupReadyWorkspace(rootDir, configPath);
    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0,
      now: NOW
    });

    const unauthenticatedStatus = await apiJson(started.url, "/api/onboarding/status", { token: "" });
    assert.equal(unauthenticatedStatus.status, 401);

    const created = await apiJson(started.url, "/api/onboarding/invitations", {
      method: "POST",
      body: {
        email: "New.Analyst@example.com",
        name: "New Analyst",
        tenant_slug: "alpha",
        role: "analyst",
        ttl_minutes: 1440,
        now: NOW
      }
    });
    assert.equal(created.status, 201);
    assert.match(created.body.invite_token, /^pinv_/);
    assert.equal(created.body.raw_invite_token_stored, false);
    assert.equal(created.body.invitation.email, "new.analyst@example.com");
    assert.equal(created.body.invitation.status, "pending");

    const registryBeforeAccept = await readFile(path.join(rootDir, "workspace-invitations.json"), "utf8");
    assert.equal(registryBeforeAccept.includes(created.body.invite_token), false);
    assert.equal(registryBeforeAccept.includes("\"session_token\""), false);

    const accepted = await apiJson(started.url, "/api/onboarding/accept", {
      method: "POST",
      token: "",
      body: {
        invite_token: created.body.invite_token,
        email: "new.analyst@example.com",
        name: "New Analyst",
        now: NOW
      }
    });
    assert.equal(accepted.status, 201);
    assert.match(accepted.body.session_token, /^psess_/);
    assert.equal(accepted.body.raw_invite_token_stored, false);
    assert.equal(accepted.body.raw_session_token_stored, false);
    assert.equal(accepted.body.invitation.status, "accepted");

    const tenantStatus = await apiJson(started.url, "/api/tenants/alpha/status", {
      token: accepted.body.session_token,
      tenant: "alpha"
    });
    assert.equal(tenantStatus.status, 200);
    assert.equal(tenantStatus.body.summary.tenant_count, 1);

    const duplicateAccept = await apiJson(started.url, "/api/onboarding/accept", {
      method: "POST",
      token: "",
      body: {
        invite_token: created.body.invite_token,
        email: "new.analyst@example.com",
        now: NOW
      }
    });
    assert.equal(duplicateAccept.status, 409);

    const status = await apiJson(started.url, "/api/onboarding/status");
    assert.equal(status.status, 200);
    assert.equal(status.body.status, "ready_for_workspace_user_onboarding");
    assert.equal(status.body.summary.invite_count, 1);
    assert.equal(status.body.summary.accepted_count, 1);
    assert.equal(status.body.summary.raw_invite_token_stored, false);
    assert.equal(JSON.stringify(status.body).includes(created.body.invite_token), false);
    assert.equal(JSON.stringify(status.body).includes(accepted.body.session_token), false);

    const controlPlane = await apiJson(started.url, "/api/control-plane");
    assert.equal(controlPlane.status, 200);
    assert.equal(controlPlane.body.onboarding.status, "ready_for_workspace_user_onboarding");

    const registryAfterAccept = await readFile(path.join(rootDir, "workspace-invitations.json"), "utf8");
    const directoryAfterAccept = await readFile(path.join(rootDir, "identity-directory.json"), "utf8");
    assert.equal(registryAfterAccept.includes(created.body.invite_token), false);
    assert.equal(registryAfterAccept.includes(accepted.body.session_token), false);
    assert.equal(directoryAfterAccept.includes(accepted.body.session_token), false);

    const html = await buildHostedConsoleHtml({
      rootDir,
      configPath,
      apiTokenHash: tokenHash,
      now: NOW
    });
    assert.match(html, /Workspace Onboarding/);
    assert.match(html, /Create invite/);
    assert.match(html, /Accept invite/);
    assert.match(html, /\/api\/onboarding\/invitations/);
    assert.match(html, /\/api\/onboarding\/accept/);
    assert.equal(html.includes(TOKEN), false);
    assert.equal(html.includes(created.body.invite_token), false);
    assert.equal(html.includes(accepted.body.session_token), false);
    assert.equal(html.includes("secret://"), false);
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 17 CLI exposes human-readable workspace invite and onboarding commands", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase17-cli-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    await setupReadyWorkspace(rootDir, configPath);
    const common = ["--root-dir", rootDir, "--now", NOW];

    const initial = runCli(["onboarding-status", ...common]);
    assert.match(initial, /Parallax Workspace Onboarding/);
    assert.match(initial, /Raw invite token stored: no/);
    assert.match(initial, /Raw session token stored: no/);

    const createdHuman = runCli([
      "invite-create",
      ...common,
      "--tenant", "alpha",
      "--email", "cli.analyst@example.com",
      "--name", "CLI Analyst",
      "--role", "analyst",
      "--ttl-minutes", "1440"
    ]);
    assert.match(createdHuman, /Parallax Workspace Invitation/);
    assert.match(createdHuman, /Invite token/);
    const inviteToken = createdHuman.match(/pinv_[A-Za-z0-9_-]+/)?.[0] ?? "";
    assert.match(inviteToken, /^pinv_/);

    const acceptedHuman = runCli([
      "invite-accept",
      ...common,
      "--invite-token", inviteToken,
      "--email", "cli.analyst@example.com",
      "--name", "CLI Analyst"
    ]);
    assert.match(acceptedHuman, /Parallax Workspace Invite Accepted/);
    assert.match(acceptedHuman, /Session token/);
    const sessionToken = acceptedHuman.match(/psess_[A-Za-z0-9_-]+/)?.[0] ?? "";
    assert.match(sessionToken, /^psess_/);

    const finalStatus = JSON.parse(runCli(["onboarding-status", ...common, "--json"]));
    assert.equal(finalStatus.status, "ready_for_workspace_user_onboarding");
    assert.equal(finalStatus.summary.accepted_count, 1);
    assert.equal(JSON.stringify(finalStatus).includes(inviteToken), false);
    assert.equal(JSON.stringify(finalStatus).includes(sessionToken), false);

    const registry = await readFile(path.join(rootDir, "workspace-invitations.json"), "utf8");
    const directory = await readFile(path.join(rootDir, "identity-directory.json"), "utf8");
    assert.equal(registry.includes(inviteToken), false);
    assert.equal(registry.includes(sessionToken), false);
    assert.equal(directory.includes(sessionToken), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
