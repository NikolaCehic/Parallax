import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
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

test("CLI analyze defaults to human-readable pipeline output", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-cli-"));
  try {
    const output = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "human CLI test",
      "--ceiling", "watchlist",
      "--now", NOW,
      "--audit-dir", auditDir
    ]);

    assert.match(output, /Parallax Analysis/);
    assert.match(output, /Pipeline Steps/);
    assert.match(output, /Python analytics/);
    assert.match(output, /Council Result/);
    assert.match(output, /Lifecycle Triggers/);
    assert.match(output, /Next Commands/);
    assert.doesNotMatch(output.trimStart(), /^\{/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});

test("CLI analyze still supports machine-readable JSON", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-cli-json-"));
  try {
    const output = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "json CLI test",
      "--ceiling", "watchlist",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]);
    const parsed = JSON.parse(output);
    assert.equal(parsed.action_class, "watchlist");
    assert.equal(parsed.thesis_state, "active");
    assert.match(parsed.audit_path, /dos_/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});

test("CLI replay, monitor, and paper commands produce human-readable reports", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-cli-flow-"));
  try {
    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "paper CLI flow",
      "--ceiling", "paper_trade_candidate",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]);
    const { audit_path: auditPath } = JSON.parse(analyzeOutput);

    const replay = runCli(["replay", "--audit", auditPath]);
    assert.match(replay, /Parallax Audit Replay/);
    assert.match(replay, /Replay status: valid/);

    const monitor = runCli([
      "monitor",
      "--audit", auditPath,
      "--price", "111",
      "--now", "2026-05-01T15:00:00Z"
    ]);
    assert.match(monitor, /Parallax Lifecycle Monitor/);
    assert.match(monitor, /Current state: invalidated/);

    const paper = runCli(["paper", "--audit", auditPath]);
    assert.match(paper, /Parallax Paper Trade/);
    assert.match(paper, /Simulated Fill/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});

test("CLI exposes product policy and local workspace commands", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-cli-workspace-"));
  try {
    const policy = runCli(["policy"]);
    assert.match(policy, /Parallax Product Boundary/);
    assert.match(policy, /Allowed Action Classes/);
    assert.match(policy, /Excluded Action Classes/);

    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "CLI workspace flow",
      "--ceiling", "paper_trade_candidate",
      "--now", NOW,
      "--audit-dir", auditDir,
      "--json"
    ]);
    const { audit_path: auditPath, library_path: libraryPath } = JSON.parse(analyzeOutput);
    assert.match(libraryPath, /library\.json$/);

    const library = runCli(["library", "--audit-dir", auditDir]);
    assert.match(library, /Parallax Dossier Library/);
    assert.match(library, /NVDA/);

    const watchlist = runCli(["watchlist", "--audit-dir", auditDir]);
    assert.match(watchlist, /Parallax Watchlist/);
    assert.match(watchlist, /paper_trade_candidate/);

    const alerts = runCli([
      "alerts",
      "--audit-dir", auditDir,
      "--prices", "NVDA=1",
      "--now", "2026-05-01T15:00:00Z"
    ]);
    assert.match(alerts, /Parallax Workspace Alerts/);
    assert.match(alerts, /Need attention: 1/);

    const sources = runCli(["sources", "--audit", auditPath]);
    assert.match(sources, /Parallax Source View/);
    assert.match(sources, /Evidence/);
    assert.match(sources, /Tool Outputs/);

    const feedback = runCli([
      "feedback",
      "--audit", auditPath,
      "--rating", "useful",
      "--notes", "CLI flow is readable",
      "--now", NOW
    ]);
    assert.match(feedback, /Parallax Alpha Feedback/);
    assert.match(feedback, /Rating: useful/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
