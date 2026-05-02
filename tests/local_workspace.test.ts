import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis, writeAuditBundle } from "../src/index.js";
import {
  exportWorkspace,
  filterWatchlistEntries,
  listLibraryEntries,
  monitorWorkspace,
  recordFeedback,
  sourceViewFromAudit,
  upsertLibraryEntry
} from "../src/library/store.js";

const NOW = "2026-05-01T14:30:00Z";

test("local workspace indexes dossiers, filters watchlists, records feedback, and exports source views", async () => {
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-workspace-"));
  try {
    const dossier = await analyzeThesis({
      symbol: "NVDA",
      horizon: "swing",
      thesis: "local workspace product test",
      actionCeiling: "paper_trade_candidate",
      now: NOW
    });
    const auditPath = await writeAuditBundle(dossier, { auditDir });
    const markdownPath = path.join(auditDir, `${dossier.id}.md`);

    await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });

    const library = await listLibraryEntries({ auditDir });
    assert.equal(library.entries.length, 1);
    assert.equal(library.entries[0].id, dossier.id);
    assert.equal(library.entries[0].policy_status, "allowed");
    assert.equal(library.entries[0].council_eval_passed, true);

    const watchlist = filterWatchlistEntries(library.entries);
    assert.equal(watchlist.length, 1);
    assert.equal(watchlist[0].action_class, "paper_trade_candidate");

    const sources = await sourceViewFromAudit(auditPath);
    assert.equal(sources.dossier_id, dossier.id);
    assert.ok(sources.sources.some((source: any) => source.kind === "price" && source.symbol === "NVDA"));
    assert.ok(sources.tool_outputs.some((output: any) => output.tool_name === "return_summary"));

    const alerts = await monitorWorkspace({
      auditDir,
      now: "2026-05-01T15:00:00Z",
      prices: { NVDA: 1 }
    });
    assert.equal(alerts.dossier_count, 1);
    assert.equal(alerts.attention_count, 1);
    assert.equal(alerts.entries[0].current_state, "invalidated");

    const feedback = await recordFeedback({
      auditPath,
      auditDir,
      rating: "useful",
      notes: "clear enough for alpha review",
      now: NOW
    });
    assert.equal(feedback.dossier_id, dossier.id);
    assert.equal(feedback.rating, "useful");

    const updatedLibrary = await listLibraryEntries({ auditDir });
    assert.equal(updatedLibrary.entries[0].feedback_count, 1);
    assert.equal(updatedLibrary.entries[0].latest_feedback_rating, "useful");

    const out = path.join(auditDir, "workspace-export.json");
    const exported = await exportWorkspace({ auditDir, out });
    assert.equal(exported.dossier_count, 1);
    assert.equal(exported.source_view_count, 1);
    const exportedJson = JSON.parse(await readFile(out, "utf8"));
    assert.equal(exportedJson.library.entries[0].id, dossier.id);
  } finally {
    await rm(auditDir, { recursive: true, force: true });
  }
});
