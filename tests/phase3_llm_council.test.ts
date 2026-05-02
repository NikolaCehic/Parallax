import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  analyzeThesis,
  promptRegistrySnapshot,
  replayAuditBundle,
  runLLMEvalSuite,
  writeAuditBundle
} from "../src/index.js";

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

test("Phase 3 LLM council creates an auditable evidence-only dossier", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase3-audit-"));
  try {
    const dossier = await analyzeThesis({
      symbol: "NVDA",
      horizon: "swing",
      thesis: "phase three LLM council smoke",
      actionCeiling: "watchlist",
      councilMode: "llm-scripted",
      now: NOW
    });

    assert.equal(dossier.council_run.provider.id, "scripted_llm_council_v0");
    assert.equal(dossier.council_run.eval_report.passed, true);
    assert.equal(dossier.council_run.contexts.length, dossier.claim_packets.length);
    assert.equal(dossier.council_run.usage.budget_exceeded, false);
    assert.ok(dossier.council_run.contexts.every((context: any) => context.context_type === "evidence_only"));
    assert.ok(dossier.council_run.contexts.every((context: any) => context.allowed_ref_ids.length > 0));

    const auditPath = await writeAuditBundle(dossier, { auditDir });
    const replay = replayAuditBundle(JSON.parse(await readFile(auditPath, "utf8")));
    assert.equal(replay.valid, true);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});

test("Phase 3 eval suite catches hallucination, fabrication, hidden recommendation, prompt injection, and cost overrun", async () => {
  const report = await runLLMEvalSuite({ now: NOW });
  assert.equal(report.passed, true);
  assert.equal(report.case_count, 6);

  const byName = Object.fromEntries(report.cases.map((item: any) => [item.name, item]));
  assert.equal(byName.safe_scripted_llm_council.observed_pass, true);
  assert.equal(byName.hallucinated_ref.observed_pass, false);
  assert.equal(byName.numeric_fabrication.observed_pass, false);
  assert.equal(byName.hidden_recommendation.observed_pass, false);
  assert.equal(byName.prompt_injection_obedience.observed_pass, false);
  assert.ok(byName.prompt_injection_obedience.context_warnings > 0);
  assert.equal(byName.cost_budget_exceeded.observed_pass, false);
  assert.equal(byName.cost_budget_exceeded.usage.budget_exceeded, true);
});

test("Phase 3 model failures downgrade action class through the normal decision gate", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "hidden recommendation should fail closed",
    actionCeiling: "paper_trade_candidate",
    councilMode: "llm-scripted",
    llmScenario: "hidden_recommendation",
    now: NOW
  });

  assert.equal(dossier.council_run.eval_report.passed, false);
  assert.equal(dossier.decision_packet.action_class, "no_trade");
  assert.equal(dossier.lifecycle.state, "invalidated");
  assert.ok(dossier.decision_packet.vetoes.some((veto: any) => String(veto.reason).includes("Council evaluation failed")));
});

test("Phase 3 prompt and persona registry is explicit and non-mutating", () => {
  const registry = promptRegistrySnapshot();
  assert.ok(registry.prompts.claim_packet_v0.rules.some((rule: string) => rule.includes("Do not invent")));
  assert.equal(registry.providers.scripted_llm_council_v0.kind, "llm_scripted");
  assert.ok(Object.values(registry.personas).every((persona: any) => persona.can_mutate_state === false));
  assert.ok(Object.values(registry.personas).every((persona: any) => persona.can_execute_orders === false));
});

test("Phase 3 CLI exposes human-readable LLM eval and LLM-backed analysis", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-phase3-cli-"));
  try {
    const evalOutput = runCli(["llm-eval"]);
    assert.match(evalOutput, /Parallax LLM Council Eval/);
    assert.match(evalOutput, /Passed: yes/);
    assert.match(evalOutput, /prompt_injection_obedience/);

    const registry = runCli(["prompt-registry"]);
    assert.match(registry, /Parallax Prompt Registry/);
    assert.match(registry, /scripted_llm_council_v0/);

    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "CLI LLM council smoke",
      "--ceiling", "watchlist",
      "--council-mode", "llm-scripted",
      "--now", NOW,
      "--audit-dir", auditDir
    ]);
    assert.match(analyzeOutput, /Council provider: scripted_llm_council_v0/);
    assert.match(analyzeOutput, /LLM budget:/);
    assert.match(analyzeOutput, /Context windows:/);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
