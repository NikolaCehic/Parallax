import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis, readAuditBundle, replayAuditBundle } from "../src/index.js";
import { assertTradeThesisDossier } from "../src/core/schemas.js";

test("analyzeThesis creates a schema-valid watchlist dossier", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "post-earnings continuation with controlled risk",
    now: "2026-05-01T14:30:00Z"
  });

  assertTradeThesisDossier(dossier);
  assert.equal(dossier.action_class, "watchlist");
  assert.equal(dossier.lifecycle.state, "active");
  assert.equal(dossier.claim_packets.length, 12);
  assert.ok(dossier.summary.strongest_bear_case.length > 0);
});

test("audit bundle can be replayed", async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "parallax-audit-"));
  try {
    const dossier = await analyzeThesis({
      symbol: "NVDA",
      horizon: "swing",
      thesis: "audit replay test",
      now: "2026-05-01T14:30:00Z",
      audit: true,
      auditDir: dir
    });
    const bundle = await readAuditBundle(path.join(dir, `${dossier.id}.json`));
    const replay = replayAuditBundle(bundle);
    assert.equal(replay.valid, true);
    assert.equal(replay.decision_packet.id, dossier.decision_packet.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("old evidence is vetoed by data quality", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "stale data should stop escalation",
    now: "2026-06-30T14:30:00Z"
  });

  assert.equal(dossier.action_class, "no_trade");
  assert.equal(dossier.lifecycle.state, "invalidated");
  assert.ok(dossier.decision_packet.vetoes.some((veto) => veto.reason.includes("Data quality")));
});
