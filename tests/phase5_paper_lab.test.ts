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
  closeLedgerTrade,
  openPaperTrade,
  paperLedgerReport,
  recordPaperReview
} from "../src/paper/lab.js";

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

async function writePaperCandidate(auditDir: string, thesis = "phase five paper lab test") {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis,
    actionCeiling: "paper_trade_candidate",
    now: NOW
  });
  assert.equal(dossier.action_class, "paper_trade_candidate");
  const auditPath = await writeAuditBundle(dossier, { auditDir });
  const markdownPath = path.join(auditDir, `${dossier.id}.md`);
  await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });
  return { dossier, auditPath };
}

test("Phase 5 paper lab persists a simulation ledger with risk reservation, attribution, review, and export portability", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase5-"));
  const importedDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase5-import-"));
  try {
    const { auditPath } = await writePaperCandidate(auditDir);

    const opened = await openPaperTrade({
      auditPath,
      auditDir,
      riskBudgetPct: 0.01,
      marketPrice: 115,
      now: "2026-05-01T15:00:00Z"
    });
    assert.equal(opened.trade.status, "open");
    assert.equal(opened.trade.simulation_only, true);
    assert.equal(opened.trade.live_execution_unlocked, false);
    assert.equal(opened.ledger_summary.open_count, 1);
    assert.ok(opened.ledger_summary.reserved_notional > 0);

    assert.rejects(
      () => openPaperTrade({
        auditPath,
        auditDir,
        riskBudgetPct: 0.02,
        marketPrice: 116,
        now: "2026-05-01T15:01:00Z"
      }),
      /Paper risk budget exceeded/
    );

    const closed = await closeLedgerTrade({
      auditDir,
      tradeId: opened.trade.id,
      exitPrice: opened.trade.filled.fill_price + 3,
      reason: "target_reached",
      now: "2026-05-02T15:00:00Z"
    });
    assert.equal(closed.trade.status, "closed");
    assert.ok(closed.trade.realized_pnl > 0);
    assert.equal(closed.trade.attribution.sizing_quality, "within_budget");
    assert.equal(closed.trade.live_execution_unlocked, false);

    const review = await recordPaperReview({
      auditDir,
      tradeId: opened.trade.id,
      rating: "disciplined",
      notes: "Entry and close followed the dossier process.",
      now: "2026-05-02T16:00:00Z"
    });
    assert.equal(review.review.trade_id, opened.trade.id);

    const report = await paperLedgerReport(auditDir);
    assert.equal(report.summary.open_count, 0);
    assert.equal(report.summary.closed_count, 1);
    assert.equal(report.summary.review_count, 1);
    assert.equal(report.summary.win_rate, 1);
    assert.equal(report.summary.live_execution_unlocked, false);
    assert.equal(report.calibration.paper_outcome_count, 1);

    const dashboard = await writeDashboard({
      auditDir,
      out: path.join(auditDir, "phase5-dashboard.html"),
      now: "2026-05-02T16:30:00Z"
    });
    const html = await readFile(dashboard.out, "utf8");
    assert.match(html, /Paper Lab/);
    assert.match(html, /Paper PnL/);

    const exportPath = path.join(auditDir, "phase5-workspace.json");
    const exported = await exportWorkspace({ auditDir, out: exportPath });
    assert.equal(exported.paper_file_count, 1);

    const imported = await importWorkspace({ input: exportPath, auditDir: importedDir });
    assert.equal(imported.paper_file_count, 1);
    const importedReport = await paperLedgerReport(importedDir);
    assert.equal(importedReport.summary.closed_count, 1);
    assert.match(importedReport.closed_trades[0].audit_path, new RegExp(importedDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  } finally {
    await rm(auditDir, { recursive: true, force: true });
    await rm(importedDir, { recursive: true, force: true });
  }
});

test("Phase 5 CLI exposes paper open, close, ledger, and review commands", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase5-cli-"));
  try {
    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "phase five CLI paper lab",
      "--ceiling", "paper_trade_candidate",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]);
    const { audit_path: auditPath } = JSON.parse(analyzeOutput);

    const openedJson = runCli([
      "paper-open",
      "--audit", auditPath,
      "--audit-dir", auditDir,
      "--risk-budget", "0.01",
      "--market-price", "115",
      "--now", "2026-05-01T15:00:00Z",
      "--json"
    ]);
    const opened = JSON.parse(openedJson);
    assert.equal(opened.trade.status, "open");

    const ledgerOpen = runCli(["paper-ledger", "--audit-dir", auditDir]);
    assert.match(ledgerOpen, /Parallax Paper Ledger/);
    assert.match(ledgerOpen, /Open: 1/);
    assert.match(ledgerOpen, /Live execution unlocked: no/);

    const closed = runCli([
      "paper-close",
      "--audit-dir", auditDir,
      "--trade", opened.trade.id,
      "--exit-price", String(opened.trade.filled.fill_price + 2),
      "--reason", "target_reached",
      "--now", "2026-05-02T15:00:00Z"
    ]);
    assert.match(closed, /Parallax Paper Close/);
    assert.match(closed, /Attribution/);
    assert.match(closed, /Simulation Boundary/);

    const review = runCli([
      "paper-review",
      "--audit-dir", auditDir,
      "--trade", opened.trade.id,
      "--rating", "disciplined",
      "--notes", "CLI workflow was easy to inspect",
      "--now", "2026-05-02T16:00:00Z"
    ]);
    assert.match(review, /Parallax Paper Review/);
    assert.match(review, /disciplined/);

    const ledgerClosed = runCli(["paper-ledger", "--audit-dir", auditDir]);
    assert.match(ledgerClosed, /Closed: 1/);
    assert.match(ledgerClosed, /Reviews: 1/);
    assert.match(ledgerClosed, /Profitable paper rate: 100.0%/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
