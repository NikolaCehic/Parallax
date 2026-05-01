import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThesis, evaluateLifecycle } from "../src/index.js";

test("price invalidator moves an active thesis to invalidated", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "lifecycle invalidation test",
    now: "2026-05-01T14:30:00Z"
  });

  const invalidation = dossier.lifecycle.triggers.find((trigger) => trigger.kind === "invalidate" && trigger.condition_type === "price");
  const threshold = Number(invalidation.condition.split("<")[1].trim());
  const updated = evaluateLifecycle(dossier.lifecycle, {
    now: "2026-05-01T15:00:00Z",
    last_price: threshold - 0.01,
    annualized_volatility_20: 0.3
  });

  assert.equal(updated.state, "invalidated");
  assert.equal(updated.freshness_score, 0);
  assert.ok(updated.fired_triggers.length >= 1);
});

test("expired thesis becomes stale", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "intraday",
    thesis: "expiry test",
    now: "2026-05-01T14:30:00Z"
  });

  const updated = evaluateLifecycle(dossier.lifecycle, {
    now: "2026-05-01T18:00:00Z",
    last_price: 114.6,
    annualized_volatility_20: 0.3
  });

  assert.equal(updated.state, "stale");
  assert.ok(updated.freshness_score <= 0.3);
});
