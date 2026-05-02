import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThesis, reviewProductPolicy } from "../src/index.js";
import { validateGovernedRelease } from "../src/governance/registry.js";

const NOW = "2026-05-01T14:30:00Z";

test("product policy caps the general product below order-ticket execution", () => {
  const review = reviewProductPolicy({
    symbol: "NVDA",
    thesis: "post-earnings continuation with controlled risk",
    actionCeiling: "order_ticket_candidate",
    userClass: "independent_analyst",
    intendedUse: "paper_trading"
  });

  assert.equal(review.status, "allowed");
  assert.equal(review.effective_action_ceiling, "paper_trade_candidate");
  assert.equal(review.ceiling_was_capped, true);
  assert.ok(review.controls.some((control: any) => control.id === "general_product_ceiling"));
});

test("product policy reframes buy-sell oracle language into research-only output", () => {
  const review = reviewProductPolicy({
    symbol: "NVDA",
    thesis: "should I buy NVDA right now",
    actionCeiling: "paper_trade_candidate"
  });

  assert.equal(review.status, "needs_reframe");
  assert.equal(review.effective_action_ceiling, "watchlist");
  assert.equal(review.can_answer_as_research, true);
  assert.ok(review.matches.some((match: any) => match.id === "buy_sell_oracle"));
});

test("blocked live-execution framing creates a no-trade dossier with policy veto", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "execute a guaranteed market order for me",
    actionCeiling: "order_ticket_candidate",
    now: NOW
  });

  assert.equal(dossier.policy_review.status, "blocked");
  assert.equal(dossier.policy_review.effective_action_ceiling, "no_trade");
  assert.equal(dossier.action_class, "no_trade");
  assert.equal(dossier.lifecycle.state, "invalidated");
  assert.ok(dossier.decision_packet.vetoes.some((veto: any) => veto.policy_id === "live_execution"));
  assert.ok(dossier.decision_packet.vetoes.some((veto: any) => veto.policy_id === "guaranteed_returns"));
  assert.equal(validateGovernedRelease({ dossier }).passed, true);
});

test("governance release validation rejects general-product order candidates", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "release validation mutation test",
    actionCeiling: "paper_trade_candidate",
    now: NOW
  });
  const mutated = structuredClone(dossier);
  mutated.decision_packet.action_class = "order_ticket_candidate";

  const release = validateGovernedRelease({ dossier: mutated });
  assert.equal(release.passed, false);
  assert.ok(release.problems.some((problem: string) => problem.includes("order_ticket_candidate")));
});
