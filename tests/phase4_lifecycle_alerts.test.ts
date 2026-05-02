import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis, readAuditBundle, replayAuditBundle, writeAuditBundle } from "../src/index.js";
import { writeDashboard } from "../src/app/dashboard.js";
import { exportWorkspace, importWorkspace, monitorWorkspace, upsertLibraryEntry } from "../src/library/store.js";
import {
  addLifecycleTrigger,
  readAlertPreferences,
  readLifecycleNotifications,
  readLifecycleOverrides,
  updateAlertPreferences
} from "../src/lifecycle/workspace.js";

const NOW = "2026-05-01T14:30:00Z";
const CLI = "dist/src/cli/parallax.js";

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

async function writeWorkspaceDossier(auditDir: string, thesis = "phase four lifecycle alert test") {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis,
    actionCeiling: "paper_trade_candidate",
    now: NOW
  });
  const auditPath = await writeAuditBundle(dossier, { auditDir });
  const markdownPath = path.join(auditDir, `${dossier.id}.md`);
  await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });
  return { dossier, auditPath };
}

test("Phase 4 lifecycle monitor supports custom triggers, change-since-last-run, notifications, and replay-safe audits", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase4-"));
  const importedDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase4-import-"));
  try {
    const { dossier, auditPath } = await writeWorkspaceDossier(auditDir);

    const added = await addLifecycleTrigger({
      auditPath,
      auditDir,
      kind: "escalate",
      conditionType: "event",
      condition: "material_event_arrives == true",
      rationale: "A fresh material event should upgrade this thesis for immediate review.",
      linkedAssumption: "event_risk_unchanged",
      now: NOW
    });
    assert.equal(added.dossier_id, dossier.id);
    assert.equal(added.trigger.kind, "escalate");

    const overrides = await readLifecycleOverrides(auditDir);
    assert.equal(overrides.overrides[dossier.id].custom_triggers.length, 1);

    const replay = replayAuditBundle(await readAuditBundle(auditPath));
    assert.equal(replay.valid, true);

    const firstMonitor = await monitorWorkspace({
      auditDir,
      now: "2026-05-01T15:00:00Z",
      events: { NVDA: true }
    });
    assert.equal(firstMonitor.attention_count, 1);
    assert.equal(firstMonitor.entries[0].current_state, "upgraded");
    assert.equal(firstMonitor.entries[0].change_since_last_run.status, "first_check");
    assert.equal(firstMonitor.notification_count, 1);

    const secondMonitor = await monitorWorkspace({
      auditDir,
      now: "2026-05-01T15:01:00Z",
      events: { NVDA: true }
    });
    assert.equal(secondMonitor.entries[0].change_since_last_run.status, "unchanged");
    assert.equal(secondMonitor.notification_count, 0);

    const muted = await updateAlertPreferences({ auditDir, mute: ["NVDA"] });
    assert.ok(muted.muted_symbols.includes("NVDA"));

    const invalidatingMonitor = await monitorWorkspace({
      auditDir,
      now: "2026-05-01T15:02:00Z",
      prices: { NVDA: 1 }
    });
    assert.equal(invalidatingMonitor.entries[0].current_state, "invalidated");
    assert.equal(invalidatingMonitor.entries[0].muted, true);
    assert.equal(invalidatingMonitor.notification_count, 0);

    const notifications = await readLifecycleNotifications(auditDir);
    assert.equal(notifications.notifications.length, 1);
    assert.equal(notifications.notifications[0].current_state, "upgraded");

    const dashboard = await writeDashboard({
      auditDir,
      out: path.join(auditDir, "phase4-dashboard.html"),
      now: "2026-05-01T15:03:00Z",
      events: { NVDA: true }
    });
    const html = await readFile(dashboard.out, "utf8");
    assert.match(html, /Notification Inbox/);
    assert.match(html, /Since Last Run/);

    const exportPath = path.join(auditDir, "phase4-workspace.json");
    const exported = await exportWorkspace({ auditDir, out: exportPath });
    assert.ok(exported.lifecycle_file_count >= 3);

    const imported = await importWorkspace({ input: exportPath, auditDir: importedDir });
    assert.ok(imported.lifecycle_file_count >= 3);
    const importedPreferences = await readAlertPreferences(importedDir);
    assert.ok(importedPreferences.muted_symbols.includes("NVDA"));
  } finally {
    await rm(auditDir, { recursive: true, force: true });
    await rm(importedDir, { recursive: true, force: true });
  }
});

test("Phase 4 CLI exposes trigger editor, preferences, alerts, and notification inbox", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase4-cli-"));
  try {
    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "phase four CLI lifecycle flow",
      "--ceiling", "watchlist",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]);
    const { audit_path: auditPath } = JSON.parse(analyzeOutput);

    const prefs = runCli(["alert-prefs", "--audit-dir", auditDir]);
    assert.match(prefs, /Parallax Alert Preferences/);
    assert.match(prefs, /local_inbox/);

    const trigger = runCli([
      "trigger-add",
      "--audit", auditPath,
      "--audit-dir", auditDir,
      "--kind", "escalate",
      "--condition-type", "event",
      "--condition", "material_event_arrives == true",
      "--rationale", "CLI material event upgrade test",
      "--now", NOW
    ]);
    assert.match(trigger, /Parallax Lifecycle Trigger/);
    assert.match(trigger, /escalate/);

    const alerts = runCli([
      "alerts",
      "--audit-dir", auditDir,
      "--events", "NVDA=true",
      "--now", "2026-05-01T15:00:00Z"
    ]);
    assert.match(alerts, /Parallax Workspace Alerts/);
    assert.match(alerts, /Need attention: 1/);
    assert.match(alerts, /Notifications: 1/);
    assert.match(alerts, /active->upgraded/);

    const notifications = runCli(["notifications", "--audit-dir", auditDir]);
    assert.match(notifications, /Parallax Lifecycle Notifications/);
    assert.match(notifications, /NVDA/);

    const muted = runCli(["alert-prefs", "--audit-dir", auditDir, "--mute", "NVDA"]);
    assert.match(muted, /Muted symbols: NVDA/);

    const triggers = runCli(["triggers", "--audit-dir", auditDir]);
    assert.match(triggers, /Parallax Lifecycle Overrides/);
    assert.match(triggers, /material_event_arrives == true/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
