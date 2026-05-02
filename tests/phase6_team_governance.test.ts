import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis, writeAuditBundle } from "../src/index.js";
import { writeDashboard } from "../src/app/dashboard.js";
import { exportWorkspace, importWorkspace, upsertLibraryEntry } from "../src/library/store.js";
import {
  addTeamMember,
  approveGovernanceReview,
  assignGovernanceReview,
  buildGovernanceReport,
  exportGovernancePackage,
  initializeTeamWorkspace,
  recordGovernanceComment
} from "../src/team/governance.js";

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

async function writeGovernedCandidate(auditDir: string) {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "phase six team governance release candidate",
    actionCeiling: "paper_trade_candidate",
    userClass: "research_team",
    intendedUse: "team_review",
    now: NOW
  });
  assert.equal(dossier.action_class, "paper_trade_candidate");
  const auditPath = await writeAuditBundle(dossier, { auditDir });
  const markdownPath = path.join(auditDir, `${dossier.id}.md`);
  await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });
  return { dossier, auditPath };
}

async function seedTeam(auditDir: string) {
  await initializeTeamWorkspace({
    auditDir,
    workspaceName: "Phase Six Desk",
    owner: "Niko Owner",
    now: "2026-05-01T15:00:00Z"
  });
  await addTeamMember({ auditDir, name: "Lena Lead", role: "lead_analyst", actor: "Niko Owner", now: "2026-05-01T15:01:00Z" });
  await addTeamMember({ auditDir, name: "Ravi Risk", role: "risk_reviewer", actor: "Niko Owner", now: "2026-05-01T15:02:00Z" });
  await addTeamMember({ auditDir, name: "Casey Compliance", role: "compliance_reviewer", actor: "Niko Owner", now: "2026-05-01T15:03:00Z" });
  await addTeamMember({ auditDir, name: "Mira Model", role: "model_validator", actor: "Niko Owner", now: "2026-05-01T15:04:00Z" });
}

test("Phase 6 team governance enforces role-aware assignments, approvals, release readiness, export, and dashboard state", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase6-"));
  const importedDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase6-import-"));
  try {
    const { auditPath } = await writeGovernedCandidate(auditDir);
    await seedTeam(auditDir);

    const analysis = await assignGovernanceReview({
      auditPath,
      auditDir,
      reviewType: "analysis_review",
      assignee: "Lena Lead",
      requester: "Niko Owner",
      note: "Check thesis clarity and dissent preservation.",
      now: "2026-05-01T15:10:00Z"
    });
    const risk = await assignGovernanceReview({
      auditPath,
      auditDir,
      reviewType: "risk_review",
      assignee: "Ravi Risk",
      requester: "Niko Owner",
      note: "Check sizing, invalidators, and lifecycle risk.",
      now: "2026-05-01T15:11:00Z"
    });
    const compliance = await assignGovernanceReview({
      auditPath,
      auditDir,
      reviewType: "compliance_review",
      assignee: "Casey Compliance",
      requester: "Niko Owner",
      note: "Confirm research-only boundary.",
      now: "2026-05-01T15:12:00Z"
    });
    const model = await assignGovernanceReview({
      auditPath,
      auditDir,
      reviewType: "model_review",
      assignee: "Mira Model",
      requester: "Niko Owner",
      note: "Confirm model and tool registry validation.",
      now: "2026-05-01T15:13:00Z"
    });

    const initialReport = await buildGovernanceReport(auditDir);
    assert.equal(initialReport.summary.release_ready_count, 0);
    assert.equal(initialReport.release_controls[0].missing_review_types.length, 4);

    await assert.rejects(
      () => approveGovernanceReview({
        auditDir,
        assignmentId: compliance.assignment.id,
        approver: "Ravi Risk",
        decision: "approved",
        rationale: "Risk reviewer should not approve compliance.",
        now: "2026-05-01T15:20:00Z"
      }),
      /cannot approve compliance_review/
    );

    const comment = await recordGovernanceComment({
      auditPath,
      auditDir,
      author: "Casey Compliance",
      body: "The dossier keeps the product boundary explicit and does not imply live execution.",
      tags: ["boundary", "approval"],
      now: "2026-05-01T15:21:00Z"
    });
    assert.equal(comment.comment.tags[0], "boundary");

    await approveGovernanceReview({
      auditDir,
      assignmentId: analysis.assignment.id,
      approver: "Lena Lead",
      decision: "approved",
      rationale: "Thesis is evidence-linked and dissent is visible.",
      now: "2026-05-01T15:30:00Z"
    });
    await approveGovernanceReview({
      auditDir,
      assignmentId: risk.assignment.id,
      approver: "Ravi Risk",
      decision: "approved",
      rationale: "Risk budget and invalidators are acceptable for paper simulation.",
      now: "2026-05-01T15:31:00Z"
    });
    await approveGovernanceReview({
      auditDir,
      assignmentId: compliance.assignment.id,
      approver: "Casey Compliance",
      decision: "approved",
      rationale: "Research-only disclosures and action ceiling are present.",
      now: "2026-05-01T15:32:00Z"
    });
    await approveGovernanceReview({
      auditDir,
      assignmentId: model.assignment.id,
      approver: "Mira Model",
      decision: "approved",
      rationale: "Registered model and tool versions validate for prototype release.",
      now: "2026-05-01T15:33:00Z"
    });

    const report = await buildGovernanceReport(auditDir);
    assert.equal(report.summary.release_ready_count, 1);
    assert.equal(report.release_controls[0].release_ready, true);
    assert.deepEqual(report.release_controls[0].missing_review_types, []);
    assert.equal(report.soc2_readiness.status, "ready");

    const dashboard = await writeDashboard({
      auditDir,
      out: path.join(auditDir, "phase6-dashboard.html"),
      now: "2026-05-01T16:00:00Z"
    });
    const html = await readFile(dashboard.out, "utf8");
    assert.match(html, /Team Governance/);
    assert.match(html, /Release Ready/);

    const governanceExport = await exportGovernancePackage({
      auditDir,
      out: path.join(auditDir, "phase6-governance-package.json")
    });
    assert.equal(governanceExport.release_ready_count, 1);
    assert.equal(governanceExport.soc2_status, "ready");

    const exportPath = path.join(auditDir, "phase6-workspace.json");
    const exported = await exportWorkspace({ auditDir, out: exportPath });
    assert.equal(exported.governance_file_count, 1);

    const imported = await importWorkspace({ input: exportPath, auditDir: importedDir });
    assert.equal(imported.governance_file_count, 1);
    const importedReport = await buildGovernanceReport(importedDir);
    assert.equal(importedReport.summary.release_ready_count, 1);
    assert.match(importedReport.assignments[0].audit_path, new RegExp(importedDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(auditDir, { recursive: true, force: true });
    await rm(importedDir, { recursive: true, force: true });
  }
});

test("Phase 6 CLI exposes team workspace, review, approval, report, and export commands", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase6-cli-"));
  try {
    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "phase six CLI team governance",
      "--ceiling", "paper_trade_candidate",
      "--user-class", "research_team",
      "--intended-use", "team_review",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]);
    const { audit_path: auditPath } = JSON.parse(analyzeOutput);

    const initialized = runCli([
      "team-init",
      "--audit-dir", auditDir,
      "--workspace-name", "CLI Governance Desk",
      "--owner", "Niko Owner"
    ]);
    assert.match(initialized, /Parallax Team Workspace/);

    for (const [name, role] of [
      ["Lena Lead", "lead_analyst"],
      ["Ravi Risk", "risk_reviewer"],
      ["Casey Compliance", "compliance_reviewer"],
      ["Mira Model", "model_validator"]
    ]) {
      const member = runCli([
        "team-member-add",
        "--audit-dir", auditDir,
        "--name", name,
        "--role", role,
        "--actor", "Niko Owner"
      ]);
      assert.match(member, /Parallax Team Member/);
    }

    const assignments: Record<string, string> = {};
    for (const [type, assignee] of [
      ["analysis_review", "Lena Lead"],
      ["risk_review", "Ravi Risk"],
      ["compliance_review", "Casey Compliance"],
      ["model_review", "Mira Model"]
    ]) {
      const assignedJson = runCli([
        "team-assign",
        "--audit", auditPath,
        "--audit-dir", auditDir,
        "--type", type,
        "--assignee", assignee,
        "--requester", "Niko Owner",
        "--note", `${type} for CLI smoke`,
        "--json"
      ]);
      assignments[type] = JSON.parse(assignedJson).assignment.id;
    }

    const comment = runCli([
      "team-comment",
      "--audit", auditPath,
      "--audit-dir", auditDir,
      "--author", "Casey Compliance",
      "--body", "Research-only boundary is clear.",
      "--tags", "boundary,release"
    ]);
    assert.match(comment, /Parallax Governance Comment/);

    for (const [type, approver] of [
      ["analysis_review", "Lena Lead"],
      ["risk_review", "Ravi Risk"],
      ["compliance_review", "Casey Compliance"],
      ["model_review", "Mira Model"]
    ]) {
      const approved = runCli([
        "team-approve",
        "--audit-dir", auditDir,
        "--assignment", assignments[type],
        "--approver", approver,
        "--decision", "approved",
        "--rationale", `${type} passed`
      ]);
      assert.match(approved, /Parallax Governance Approval/);
    }

    const report = runCli(["team-report", "--audit-dir", auditDir]);
    assert.match(report, /Parallax Team Governance/);
    assert.match(report, /Release ready: 1/);
    assert.match(report, /SOC 2 readiness: ready/);

    const exported = runCli([
      "team-export",
      "--audit-dir", auditDir,
      "--out", path.join(auditDir, "governance-export.json")
    ]);
    assert.match(exported, /Parallax Governance Export/);
    assert.match(exported, /Release ready: 1/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
