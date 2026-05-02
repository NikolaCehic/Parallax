import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThesis, evaluateClaimPackets } from "../src/index.js";

const NOW = "2026-05-01T14:30:00Z";

test("analyzeThesis records a passing council provider evaluation", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "provider eval smoke test",
    actionCeiling: "watchlist",
    now: NOW
  });

  assert.equal(dossier.council_run.provider.id, "deterministic_rule_council_v0");
  assert.equal(dossier.council_run.eval_report.passed, true);
  assert.equal(dossier.council_run.eval_report.problems.length, 0);
  assert.equal(dossier.council_run.eval_report.claim_packet_count, dossier.claim_packets.length);
});

test("claim-packet evaluation fails unknown evidence refs before future LLM packets can reach the gate", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "provider eval mutation test",
    actionCeiling: "watchlist",
    now: NOW
  });
  const mutated = structuredClone(dossier.claim_packets);
  mutated[0].evidence_refs = ["missing_ref"];

  const report = evaluateClaimPackets({
    snapshot: dossier.evidence_snapshot,
    toolOutputs: dossier.tool_outputs,
    claimPackets: mutated,
    policyReview: dossier.policy_review
  });

  assert.equal(report.passed, false);
  assert.ok(report.problems.some((problem: string) => problem.includes("missing_ref")));
});
