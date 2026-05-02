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
  initializeTeamWorkspace
} from "../src/team/governance.js";
import {
  approvePartnerOrder,
  createPartnerOrderTicket,
  evaluatePartnerOrderControls,
  partnerExecutionReport,
  recordLegalApproval,
  recordMarketAccessReview,
  recordPostTradeReview,
  registerExecutionPartner,
  submitPartnerOrder,
  updatePartnerKillSwitch
} from "../src/execution/partner.js";

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

async function writePaperCandidate(auditDir: string, thesis = "phase seven regulated partner candidate") {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis,
    actionCeiling: "paper_trade_candidate",
    userClass: "professional_reviewer",
    intendedUse: "governance_review",
    now: NOW
  });
  assert.equal(dossier.action_class, "paper_trade_candidate");
  const auditPath = await writeAuditBundle(dossier, { auditDir });
  const markdownPath = path.join(auditDir, `${dossier.id}.md`);
  await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });
  return { dossier, auditPath };
}

async function makeTeamReleaseReady(auditDir: string, auditPath: string) {
  await initializeTeamWorkspace({
    auditDir,
    workspaceName: "Phase Seven Execution Desk",
    owner: "Niko Owner",
    now: "2026-05-01T15:00:00Z"
  });
  for (const [name, role] of [
    ["Lena Lead", "lead_analyst"],
    ["Ravi Risk", "risk_reviewer"],
    ["Casey Compliance", "compliance_reviewer"],
    ["Mira Model", "model_validator"]
  ]) {
    await addTeamMember({ auditDir, name, role, actor: "Niko Owner", now: "2026-05-01T15:01:00Z" });
  }
  for (const [reviewType, assignee] of [
    ["analysis_review", "Lena Lead"],
    ["risk_review", "Ravi Risk"],
    ["compliance_review", "Casey Compliance"],
    ["model_review", "Mira Model"]
  ]) {
    const assigned = await assignGovernanceReview({
      auditPath,
      auditDir,
      reviewType,
      assignee,
      requester: "Niko Owner",
      note: `${reviewType} required for partner execution handoff.`,
      now: "2026-05-01T15:10:00Z"
    });
    await approveGovernanceReview({
      auditDir,
      assignmentId: assigned.assignment.id,
      approver: assignee,
      decision: "approved",
      rationale: `${reviewType} passed.`,
      now: "2026-05-01T15:20:00Z"
    });
  }
}

test("Phase 7 partner execution blocks bypasses and permits only controlled partner sandbox handoff", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase7-"));
  const importedDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase7-import-"));
  try {
    const { auditPath } = await writePaperCandidate(auditDir);
    await makeTeamReleaseReady(auditDir, auditPath);

    await registerExecutionPartner({
      auditDir,
      partnerId: "regulated_sandbox",
      name: "Regulated Partner Sandbox",
      regulated: true,
      environment: "sandbox",
      now: "2026-05-01T15:30:00Z"
    });

    const ticket = await createPartnerOrderTicket({
      auditPath,
      auditDir,
      partnerId: "regulated_sandbox",
      environment: "sandbox",
      riskBudgetPct: 0.005,
      now: "2026-05-01T15:31:00Z"
    });
    let controls = await evaluatePartnerOrderControls({
      auditDir,
      ticketId: ticket.ticket.id,
      now: "2026-05-01T15:32:00Z"
    });
    assert.equal(controls.passed, false);
    assert.ok(controls.problems.includes("No valid legal/compliance approval."));
    assert.ok(controls.problems.includes("No valid human approval."));

    await recordLegalApproval({
      auditDir,
      partnerId: "regulated_sandbox",
      approver: "Counsel",
      scope: "sandbox",
      memo: "Sandbox handoff approved for governed paper candidates only.",
      now: "2026-05-01T15:33:00Z"
    });
    await recordMarketAccessReview({
      auditDir,
      partnerId: "regulated_sandbox",
      reviewer: "Market Access Principal",
      environment: "sandbox",
      maxOrderNotional: 2000,
      maxDailyNotional: 3000,
      allowedSymbols: ["NVDA"],
      allowedSides: ["buy"],
      now: "2026-05-01T15:34:00Z"
    });

    await assert.rejects(
      () => submitPartnerOrder({ auditDir, ticketId: ticket.ticket.id, now: "2026-05-01T15:35:00Z" }),
      /No valid human approval/
    );

    await approvePartnerOrder({
      auditDir,
      ticketId: ticket.ticket.id,
      approver: "Human Trader",
      rationale: "Approved after team, legal, and market-access controls.",
      now: "2026-05-01T15:36:00Z"
    });
    controls = await evaluatePartnerOrderControls({
      auditDir,
      ticketId: ticket.ticket.id,
      now: "2026-05-01T15:37:00Z"
    });
    assert.equal(controls.passed, true);

    await updatePartnerKillSwitch({
      auditDir,
      enabled: true,
      reason: "test halt",
      now: "2026-05-01T15:38:00Z"
    });
    await assert.rejects(
      () => submitPartnerOrder({ auditDir, ticketId: ticket.ticket.id, now: "2026-05-01T15:39:00Z" }),
      /Kill switch active/
    );
    await updatePartnerKillSwitch({
      auditDir,
      enabled: false,
      now: "2026-05-01T15:40:00Z"
    });

    const submitted = await submitPartnerOrder({
      auditDir,
      ticketId: ticket.ticket.id,
      now: "2026-05-01T15:41:00Z"
    });
    assert.equal(submitted.submission.status, "submitted_to_partner_sandbox");
    assert.equal(submitted.submission.live_execution, false);
    assert.equal(submitted.submission.reversible, true);

    const review = await recordPostTradeReview({
      auditDir,
      submissionId: submitted.submission.id,
      reviewer: "Execution Ops",
      outcome: "acceptable",
      notes: "Sandbox handoff matched approval scope.",
      now: "2026-05-01T16:00:00Z"
    });
    assert.equal(review.review.outcome, "acceptable");

    const productionTicket = await createPartnerOrderTicket({
      auditPath,
      auditDir,
      partnerId: "regulated_sandbox",
      environment: "production",
      riskBudgetPct: 0.005,
      now: "2026-05-01T16:05:00Z"
    });
    await recordLegalApproval({
      auditDir,
      partnerId: "regulated_sandbox",
      approver: "Counsel",
      scope: "production",
      memo: "Production paperwork exists, but adapter is still locked.",
      now: "2026-05-01T16:06:00Z"
    });
    await recordMarketAccessReview({
      auditDir,
      partnerId: "regulated_sandbox",
      reviewer: "Market Access Principal",
      environment: "production",
      maxOrderNotional: 2000,
      maxDailyNotional: 3000,
      allowedSymbols: ["NVDA"],
      allowedSides: ["buy"],
      now: "2026-05-01T16:07:00Z"
    });
    await approvePartnerOrder({
      auditDir,
      ticketId: productionTicket.ticket.id,
      approver: "Human Trader",
      rationale: "Production should still fail because adapter is locked.",
      now: "2026-05-01T16:08:00Z"
    });
    await assert.rejects(
      () => submitPartnerOrder({
        auditDir,
        ticketId: productionTicket.ticket.id,
        now: "2026-05-01T16:09:00Z"
      }),
      /Production adapter is locked/
    );

    const report = await partnerExecutionReport(auditDir);
    assert.equal(report.summary.submission_count, 1);
    assert.equal(report.summary.sandbox_submission_count, 1);
    assert.equal(report.summary.production_submission_count, 0);
    assert.equal(report.summary.post_trade_review_count, 1);
    assert.equal(report.summary.production_unlocked, false);

    const dashboard = await writeDashboard({
      auditDir,
      out: path.join(auditDir, "phase7-dashboard.html"),
      now: "2026-05-01T16:10:00Z"
    });
    const html = await readFile(dashboard.out, "utf8");
    assert.match(html, /Partner Execution/);
    assert.match(html, /Partner Submissions/);

    const exportPath = path.join(auditDir, "phase7-workspace.json");
    const exported = await exportWorkspace({ auditDir, out: exportPath });
    assert.equal(exported.execution_file_count, 1);
    const imported = await importWorkspace({ input: exportPath, auditDir: importedDir });
    assert.equal(imported.execution_file_count, 1);
    const importedReport = await partnerExecutionReport(importedDir);
    assert.equal(importedReport.summary.submission_count, 1);
    assert.match(importedReport.submissions[0].audit_path, new RegExp(importedDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(auditDir, { recursive: true, force: true });
    await rm(importedDir, { recursive: true, force: true });
  }
});

test("Phase 7 CLI exposes partner execution controls and sandbox handoff", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase7-cli-"));
  try {
    const analyzed = JSON.parse(runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "phase seven CLI partner handoff",
      "--ceiling", "paper_trade_candidate",
      "--user-class", "professional_reviewer",
      "--intended-use", "governance_review",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]));
    const auditPath = analyzed.audit_path;

    runCli(["team-init", "--audit-dir", auditDir, "--workspace-name", "CLI Execution Desk", "--owner", "Niko Owner"]);
    for (const [name, role] of [
      ["Lena Lead", "lead_analyst"],
      ["Ravi Risk", "risk_reviewer"],
      ["Casey Compliance", "compliance_reviewer"],
      ["Mira Model", "model_validator"]
    ]) {
      runCli(["team-member-add", "--audit-dir", auditDir, "--name", name, "--role", role, "--actor", "Niko Owner"]);
    }
    for (const [type, assignee] of [
      ["analysis_review", "Lena Lead"],
      ["risk_review", "Ravi Risk"],
      ["compliance_review", "Casey Compliance"],
      ["model_review", "Mira Model"]
    ]) {
      const assigned = JSON.parse(runCli([
        "team-assign",
        "--audit", auditPath,
        "--audit-dir", auditDir,
        "--type", type,
        "--assignee", assignee,
        "--requester", "Niko Owner",
        "--json"
      ]));
      runCli([
        "team-approve",
        "--audit-dir", auditDir,
        "--assignment", assigned.assignment.id,
        "--approver", assignee,
        "--decision", "approved",
        "--rationale", `${type} passed`
      ]);
    }

    const partner = runCli([
      "partner-register",
      "--audit-dir", auditDir,
      "--partner-id", "cli_partner",
      "--name", "CLI Regulated Sandbox",
      "--now", "2026-05-01T15:30:00Z"
    ]);
    assert.match(partner, /Parallax Execution Partner/);

    const legal = runCli([
      "partner-legal-approve",
      "--audit-dir", auditDir,
      "--partner-id", "cli_partner",
      "--approver", "Counsel",
      "--scope", "sandbox",
      "--now", "2026-05-01T15:31:00Z"
    ]);
    assert.match(legal, /Parallax Partner Legal Approval/);

    const market = runCli([
      "partner-market-review",
      "--audit-dir", auditDir,
      "--partner-id", "cli_partner",
      "--reviewer", "Market Access Principal",
      "--allowed-symbols", "NVDA",
      "--max-order-notional", "2000",
      "--max-daily-notional", "3000",
      "--now", "2026-05-01T15:32:00Z"
    ]);
    assert.match(market, /Parallax Market Access Review/);

    const ticket = JSON.parse(runCli([
      "partner-ticket",
      "--audit", auditPath,
      "--audit-dir", auditDir,
      "--partner-id", "cli_partner",
      "--risk-budget", "0.005",
      "--now", "2026-05-01T15:33:00Z",
      "--json"
    ]));

    const beforeApproval = runCli([
      "partner-controls",
      "--audit-dir", auditDir,
      "--ticket", ticket.ticket.id,
      "--now", "2026-05-01T15:34:00Z"
    ]);
    assert.match(beforeApproval, /No valid human approval/);

    const approved = runCli([
      "partner-approve",
      "--audit-dir", auditDir,
      "--ticket", ticket.ticket.id,
      "--approver", "Human Trader",
      "--rationale", "CLI handoff approved",
      "--now", "2026-05-01T15:35:00Z"
    ]);
    assert.match(approved, /Parallax Partner Human Approval/);

    const controls = runCli([
      "partner-controls",
      "--audit-dir", auditDir,
      "--ticket", ticket.ticket.id,
      "--now", "2026-05-01T15:36:00Z"
    ]);
    assert.match(controls, /Passed: yes/);

    const submitted = JSON.parse(runCli([
      "partner-submit",
      "--audit-dir", auditDir,
      "--ticket", ticket.ticket.id,
      "--now", "2026-05-01T15:37:00Z",
      "--json"
    ]));
    assert.equal(submitted.submission.status, "submitted_to_partner_sandbox");

    const post = runCli([
      "partner-post-review",
      "--audit-dir", auditDir,
      "--submission", submitted.submission.id,
      "--reviewer", "Execution Ops",
      "--outcome", "acceptable",
      "--notes", "CLI sandbox handoff reviewed",
      "--now", "2026-05-01T15:45:00Z"
    ]);
    assert.match(post, /Parallax Post-Trade Review/);

    const report = runCli(["partner-report", "--audit-dir", auditDir]);
    assert.match(report, /Parallax Partner Execution Report/);
    assert.match(report, /Sandbox submissions: 1/);
    assert.match(report, /Production unlocked: no/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
