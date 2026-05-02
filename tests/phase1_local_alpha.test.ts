import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-01T14:30:00Z";

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

test("Phase 1 E2E local alpha workspace is portable, reviewable, and dashboard-ready", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase1-"));
  const importedDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase1-import-"));
  try {
    const clean = JSON.parse(runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "phase one portable alpha dossier",
      "--ceiling", "paper_trade_candidate",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]));
    const blocked = JSON.parse(runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "execute a guaranteed market order for phase one",
      "--ceiling", "order_ticket_candidate",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]));

    assert.equal(clean.action_class, "paper_trade_candidate");
    assert.equal(blocked.action_class, "no_trade");
    assert.equal(blocked.policy_status, "blocked");

    runCli([
      "feedback",
      "--audit", clean.audit_path,
      "--rating", "useful",
      "--notes", "phase one dossier is readable",
      "--now", NOW
    ]);

    const library = JSON.parse(runCli(["library", "--audit-dir", auditDir, "--json"]));
    assert.equal(library.entries.length, 2);
    assert.ok(library.entries.some((entry: any) => entry.policy_status === "blocked"));

    const alerts = JSON.parse(runCli([
      "alerts",
      "--audit-dir", auditDir,
      "--prices", "NVDA=1",
      "--now", "2026-05-01T15:00:00Z",
      "--json"
    ]));
    assert.equal(alerts.dossier_count, 2);
    assert.ok(alerts.attention_count >= 1);

    const exportPath = path.join(auditDir, "phase1-workspace.json");
    const exported = JSON.parse(runCli(["export", "--audit-dir", auditDir, "--out", exportPath, "--json"]));
    assert.equal(exported.dossier_count, 2);
    assert.equal(exported.audit_bundle_count, 2);
    assert.equal(exported.feedback_count, 1);

    const imported = JSON.parse(runCli(["import", "--in", exportPath, "--audit-dir", importedDir, "--json"]));
    assert.equal(imported.dossier_count, 2);

    const dashboardPath = path.join(importedDir, "phase1-dashboard.html");
    const dashboard = JSON.parse(runCli([
      "app",
      "--audit-dir", importedDir,
      "--out", dashboardPath,
      "--prices", "NVDA=1",
      "--now", "2026-05-01T15:00:00Z",
      "--json"
    ]));
    assert.ok(dashboard.bytes > 1000);
    const html = await readFile(dashboardPath, "utf8");
    assert.match(html, /Parallax Local Alpha/);
    assert.match(html, /Product Boundary/);
    assert.match(html, /Lifecycle Alerts/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
    await rm(importedDir, { recursive: true, force: true });
  }
});
