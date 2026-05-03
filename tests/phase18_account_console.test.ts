import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  hostedApiTokenHash,
  startHostedServer
} from "../src/saas/server.js";
import { applyConnectorRepair } from "../src/saas/setup_repair.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-03T12:00:00Z";
const TOKEN = "phase-18-hosted-token";

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

test("Phase 18 hosted public join and tenant console support account self-service without control-plane leakage", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase18-api-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  let started: Awaited<ReturnType<typeof startHostedServer>> | undefined;
  try {
    await setupReadyWorkspace(rootDir, configPath);
    started = await startHostedServer({
      rootDir,
      configPath,
      apiToken: TOKEN,
      port: 0,
      now: NOW
    });

    const created = await apiJson(started.url, "/api/onboarding/invitations", {
      method: "POST",
      body: {
        email: "phase18.analyst@example.com",
        name: "Phase 18 Analyst",
        tenant_slug: "alpha",
        role: "analyst",
        ttl_minutes: 1440,
        now: NOW
      }
    });
    assert.equal(created.status, 201);
    assert.match(created.body.invite_token, /^pinv_/);

    const joinResponse = await fetch(`${started.url}/join?token=${encodeURIComponent(created.body.invite_token)}`);
    const joinHtml = await joinResponse.text();
    assert.equal(joinResponse.status, 200);
    assert.match(joinHtml, /Join workspace/);
    assert.match(joinHtml, /\/api\/onboarding\/accept/);
    assert.match(joinHtml, /\/tenant-console/);
    assert.equal(joinHtml.includes(created.body.invite_token), false);
    assert.equal(joinHtml.includes(TOKEN), false);
    assert.equal(joinHtml.includes("secret://"), false);

    const accepted = await apiJson(started.url, "/api/onboarding/accept", {
      method: "POST",
      token: "",
      body: {
        invite_token: created.body.invite_token,
        email: "phase18.analyst@example.com",
        name: "Phase 18 Analyst",
        now: NOW
      }
    });
    assert.equal(accepted.status, 201);
    assert.match(accepted.body.session_token, /^psess_/);

    const tenantConsoleResponse = await fetch(`${started.url}/tenant-console?tenant=alpha`);
    const tenantConsoleHtml = await tenantConsoleResponse.text();
    assert.equal(tenantConsoleResponse.status, 200);
    assert.match(tenantConsoleHtml, /Tenant Console/);
    assert.match(tenantConsoleHtml, /\/api\/account\/me/);
    assert.match(tenantConsoleHtml, /\/api\/account\/profile/);
    assert.match(tenantConsoleHtml, /\/api\/tenants\//);
    assert.equal(tenantConsoleHtml.includes("/api/control-plane"), false);
    assert.equal(tenantConsoleHtml.includes(created.body.invite_token), false);
    assert.equal(tenantConsoleHtml.includes(accepted.body.session_token), false);
    assert.equal(tenantConsoleHtml.includes(TOKEN), false);

    const account = await apiJson(started.url, "/api/account/me", {
      token: accepted.body.session_token
    });
    assert.equal(account.status, 200);
    assert.equal(account.body.profile.email, "phase18.analyst@example.com");
    assert.equal(account.body.session.role, "analyst");
    assert.equal(JSON.stringify(account.body).includes(accepted.body.session_token), false);

    const updated = await apiJson(started.url, "/api/account/profile", {
      method: "POST",
      token: accepted.body.session_token,
      body: {
        name: "Renamed Analyst",
        default_tenant_slug: "alpha",
        now: NOW
      }
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.profile.name, "Renamed Analyst");
    assert.equal(updated.body.profile.preferences.default_tenant_slug, "alpha");

    const role = await apiJson(started.url, "/api/account/memberships", {
      method: "POST",
      body: {
        email: "phase18.analyst@example.com",
        tenant_slug: "alpha",
        role: "reviewer",
        now: NOW
      }
    });
    assert.equal(role.status, 200);
    assert.equal(role.body.membership.role, "reviewer");
    assert.equal(role.body.updated_session_count, 1);

    const accountAfterRole = await apiJson(started.url, "/api/account/me", {
      token: accepted.body.session_token
    });
    assert.equal(accountAfterRole.status, 200);
    assert.equal(accountAfterRole.body.session.role, "reviewer");
    assert.equal(accountAfterRole.body.active_membership.role, "reviewer");

    const deniedAnalysis = await apiJson(started.url, "/api/tenants/alpha/analyze", {
      method: "POST",
      token: accepted.body.session_token,
      tenant: "alpha",
      body: {
        symbol: "NVDA",
        thesis: "reviewer role should not create a new analysis",
        now: NOW
      }
    });
    assert.equal(deniedAnalysis.status, 403);

    const directory = await readFile(path.join(rootDir, "identity-directory.json"), "utf8");
    assert.equal(directory.includes(accepted.body.session_token), false);
    assert.equal(directory.includes(created.body.invite_token), false);
  } finally {
    if (started) await started.close();
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 18 CLI exposes account self-service and membership role management", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase18-cli-"));
  const configPath = path.join(rootDir, "managed-saas.json");
  try {
    await setupReadyWorkspace(rootDir, configPath);
    const common = ["--root-dir", rootDir, "--now", NOW];

    const createdHuman = runCli([
      "invite-create",
      ...common,
      "--tenant", "alpha",
      "--email", "cli.phase18@example.com",
      "--name", "CLI Phase18",
      "--role", "analyst"
    ]);
    const inviteToken = createdHuman.match(/pinv_[A-Za-z0-9_-]+/)?.[0] ?? "";
    assert.match(inviteToken, /^pinv_/);

    const acceptedHuman = runCli([
      "invite-accept",
      ...common,
      "--invite-token", inviteToken,
      "--email", "cli.phase18@example.com",
      "--name", "CLI Phase18"
    ]);
    const sessionToken = acceptedHuman.match(/psess_[A-Za-z0-9_-]+/)?.[0] ?? "";
    assert.match(sessionToken, /^psess_/);

    const account = runCli([
      "account-me",
      ...common,
      "--session-token", sessionToken
    ]);
    assert.match(account, /Parallax Account/);
    assert.match(account, /Active role: analyst/);
    assert.equal(account.includes(sessionToken), false);

    const updated = runCli([
      "account-profile-update",
      ...common,
      "--session-token", sessionToken,
      "--name", "CLI Renamed",
      "--default-tenant", "alpha"
    ]);
    assert.match(updated, /Parallax Account Updated/);
    assert.match(updated, /Name: CLI Renamed/);

    const role = runCli([
      "membership-role-set",
      ...common,
      "--email", "cli.phase18@example.com",
      "--tenant", "alpha",
      "--role", "reviewer"
    ]);
    assert.match(role, /Parallax Membership Role/);
    assert.match(role, /Role: reviewer/);
    assert.match(role, /Updated sessions: 1/);

    const finalAccount = JSON.parse(runCli([
      "account-me",
      ...common,
      "--session-token", sessionToken,
      "--json"
    ]));
    assert.equal(finalAccount.profile.name, "CLI Renamed");
    assert.equal(finalAccount.session.role, "reviewer");
    assert.equal(finalAccount.raw_session_token_stored, false);
    assert.equal(JSON.stringify(finalAccount).includes(sessionToken), false);

    const directory = await readFile(path.join(rootDir, "identity-directory.json"), "utf8");
    assert.equal(directory.includes(sessionToken), false);
    assert.equal(directory.includes(inviteToken), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
