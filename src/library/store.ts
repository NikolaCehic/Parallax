import { mkdir, readdir, readFile, writeFile, appendFile } from "node:fs/promises";
import path from "node:path";
import { makeId, isoNow } from "../core/ids.js";
import { readAuditBundle } from "../audit.js";
import { evaluateLifecycle } from "../lifecycle/engine.js";

export const LIBRARY_FILE = "library.json";

async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

function parseJsonLines(text = "") {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function entryFromDossier(dossier: any, {
  auditPath,
  markdownPath
}: {
  auditPath?: string;
  markdownPath?: string;
} = {}) {
  return {
    id: dossier.id,
    title: dossier.title,
    symbol: dossier.symbol,
    horizon: dossier.horizon,
    thesis: dossier.thesis,
    created_at: dossier.created_at,
    action_class: dossier.decision_packet.action_class,
    thesis_state: dossier.lifecycle.state,
    confidence: dossier.decision_packet.confidence,
    freshness_score: dossier.lifecycle.freshness_score,
    expires_at: dossier.lifecycle.expires_at,
    next_review_trigger: dossier.decision_packet.next_review_trigger,
    veto_count: dossier.decision_packet.vetoes.length,
    required_check_count: dossier.summary.required_checks.length,
    policy_status: dossier.policy_review?.status ?? "unknown",
    policy_ceiling: dossier.policy_review?.effective_action_ceiling ?? "unknown",
    council_provider: dossier.council_run?.provider?.id ?? "unknown",
    council_eval_passed: dossier.council_run?.eval_report?.passed ?? undefined,
    audit_path: auditPath,
    markdown_path: markdownPath,
    feedback_count: 0,
    latest_feedback_rating: undefined
  };
}

function mergeEntries(existing: any[], incoming: any[]) {
  const byId = new Map<string, any>();
  for (const entry of existing) byId.set(entry.id, entry);
  for (const entry of incoming) {
    const previous = byId.get(entry.id) ?? {};
    byId.set(entry.id, {
      ...previous,
      ...entry,
      feedback_count: previous.feedback_count ?? entry.feedback_count ?? 0,
      latest_feedback_rating: previous.latest_feedback_rating ?? entry.latest_feedback_rating
    });
  }
  return [...byId.values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function loadLibrary(auditDir = "audits") {
  const libraryPath = path.join(auditDir, LIBRARY_FILE);
  const existing = await readJsonIfExists(libraryPath, { schema_version: "0.1.0", entries: [] });
  const discovered: any[] = [];

  try {
    const files = await readdir(auditDir);
    for (const file of files) {
      if (!file.endsWith(".json")) continue;
      if (file === LIBRARY_FILE) continue;
      if (file.endsWith(".feedback.json")) continue;

      try {
        const fullPath = path.join(auditDir, file);
        const bundle = await readAuditBundle(fullPath);
        if (bundle?.dossier?.id) {
          const markdownPath = path.join(auditDir, `${bundle.dossier.id}.md`);
          discovered.push(entryFromDossier(bundle.dossier, { auditPath: fullPath, markdownPath }));
        }
      } catch {
        // Ignore non-audit JSON files in the local workspace.
      }
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }

  return {
    schema_version: existing.schema_version ?? "0.1.0",
    audit_dir: auditDir,
    entries: mergeEntries(existing.entries ?? [], discovered)
  };
}

export async function upsertLibraryEntry({
  auditDir = "audits",
  dossier,
  auditPath,
  markdownPath
}: {
  auditDir?: string;
  dossier: any;
  auditPath?: string;
  markdownPath?: string;
}) {
  const library = await loadLibrary(auditDir);
  const next = {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    entries: mergeEntries(library.entries, [entryFromDossier(dossier, { auditPath, markdownPath })])
  };
  await writeJson(path.join(auditDir, LIBRARY_FILE), next);
  return next;
}

export function filterWatchlistEntries(entries: any[]) {
  return entries.filter((entry) =>
    ["watchlist", "paper_trade_candidate"].includes(entry.action_class) &&
    ["active", "stale"].includes(entry.thesis_state)
  );
}

export async function listLibraryEntries({
  auditDir = "audits",
  symbol,
  state,
  action
}: {
  auditDir?: string;
  symbol?: string;
  state?: string;
  action?: string;
} = {}) {
  const library = await loadLibrary(auditDir);
  let entries = library.entries;
  if (symbol) entries = entries.filter((entry) => entry.symbol === symbol);
  if (state) entries = entries.filter((entry) => entry.thesis_state === state);
  if (action) entries = entries.filter((entry) => entry.action_class === action);
  return { ...library, entries };
}

export async function sourceViewFromAudit(auditPath: string) {
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  return {
    dossier_id: dossier.id,
    symbol: dossier.symbol,
    evidence_snapshot_id: dossier.evidence_snapshot.id,
    evidence_hash: dossier.evidence_snapshot.hash,
    sources: dossier.evidence_snapshot.items.map((item: any) => ({
      id: item.id,
      kind: item.kind,
      symbol: item.symbol,
      source: item.source,
      as_of: item.as_of,
      retrieved_at: item.retrieved_at,
      freshness_status: item.freshness_status,
      license: item.license,
      payload_ref: item.payload_ref,
      hash: item.hash
    })),
    tool_outputs: dossier.tool_outputs.map((output: any) => ({
      id: output.id,
      tool_name: output.tool_name,
      status: output.status,
      result_hash: output.result_hash,
      created_at: output.created_at
    }))
  };
}

export async function recordFeedback({
  auditPath,
  auditDir = path.dirname(auditPath),
  rating,
  notes = "",
  reviewer = "local_alpha_user",
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  rating: string;
  notes?: string;
  reviewer?: string;
  now?: string;
}) {
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const feedback = {
    id: makeId("fb", { dossier_id: dossier.id, rating, notes, reviewer, now }),
    dossier_id: dossier.id,
    rating,
    notes,
    reviewer,
    created_at: now
  };

  await mkdir(auditDir, { recursive: true });
  await appendFile(
    path.join(auditDir, `${dossier.id}.feedback.jsonl`),
    `${JSON.stringify(feedback)}\n`
  );

  const library = await loadLibrary(auditDir);
  const entries = library.entries.map((entry) => {
    if (entry.id !== dossier.id) return entry;
    return {
      ...entry,
      feedback_count: (entry.feedback_count ?? 0) + 1,
      latest_feedback_rating: rating
    };
  });
  await writeJson(path.join(auditDir, LIBRARY_FILE), {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    entries
  });

  return feedback;
}

export async function readFeedback(auditDir = "audits") {
  const feedback: any[] = [];
  try {
    const files = await readdir(auditDir);
    for (const file of files) {
      if (!file.endsWith(".feedback.jsonl")) continue;
      const text = await readFile(path.join(auditDir, file), "utf8");
      feedback.push(...parseJsonLines(text));
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
  }
  return feedback.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
}

export async function summarizeFeedback(auditDir = "audits") {
  const feedback = await readFeedback(auditDir);
  const byRating: Record<string, number> = {};
  const byDossier: Record<string, number> = {};
  for (const item of feedback) {
    byRating[item.rating] = (byRating[item.rating] ?? 0) + 1;
    byDossier[item.dossier_id] = (byDossier[item.dossier_id] ?? 0) + 1;
  }
  return {
    audit_dir: auditDir,
    feedback_count: feedback.length,
    by_rating: byRating,
    by_dossier: byDossier,
    latest: feedback.slice(0, 5)
  };
}

export async function exportWorkspace({
  auditDir = "audits",
  out
}: {
  auditDir?: string;
  out: string;
}) {
  const library = await loadLibrary(auditDir);
  const sources = [];
  const auditBundles = [];
  const markdownDocuments = [];
  for (const entry of library.entries) {
    if (!entry.audit_path) continue;
    try {
      const sourceView = await sourceViewFromAudit(entry.audit_path);
      sources.push(sourceView);
      const bundle = await readAuditBundle(entry.audit_path);
      auditBundles.push({
        dossier_id: bundle.dossier.id,
        file_name: `${bundle.dossier.id}.json`,
        bundle
      });
      if (entry.markdown_path) {
        const markdown = await readTextIfExists(entry.markdown_path);
        if (markdown !== undefined) {
          markdownDocuments.push({
            dossier_id: bundle.dossier.id,
            file_name: `${bundle.dossier.id}.md`,
            markdown
          });
        }
      }
    } catch {
      sources.push({
        dossier_id: entry.id,
        error: "Could not load audit bundle."
      });
    }
  }
  const feedback = await readFeedback(auditDir);

  const body = {
    schema_version: "0.1.0",
    exported_at: isoNow(),
    library,
    sources,
    audit_bundles: auditBundles,
    markdown_documents: markdownDocuments,
    feedback
  };
  await writeJson(out, body);
  return {
    out,
    dossier_count: library.entries.length,
    source_view_count: sources.length,
    audit_bundle_count: auditBundles.length,
    feedback_count: feedback.length
  };
}

export async function importWorkspace({
  input,
  auditDir = "audits"
}: {
  input: string;
  auditDir?: string;
}) {
  const imported = JSON.parse(await readFile(input, "utf8"));
  await mkdir(auditDir, { recursive: true });

  const entries = [];
  for (const item of imported.audit_bundles ?? []) {
    const dossier = item.bundle.dossier;
    const auditPath = path.join(auditDir, `${dossier.id}.json`);
    const markdownPath = path.join(auditDir, `${dossier.id}.md`);
    await writeJson(auditPath, item.bundle);
    entries.push(entryFromDossier(dossier, { auditPath, markdownPath }));
  }

  for (const item of imported.markdown_documents ?? []) {
    await writeFile(path.join(auditDir, `${item.dossier_id}.md`), item.markdown);
  }

  const feedbackByDossier = new Map<string, any[]>();
  for (const item of imported.feedback ?? []) {
    const current = feedbackByDossier.get(item.dossier_id) ?? [];
    current.push(item);
    feedbackByDossier.set(item.dossier_id, current);
  }
  for (const [dossierId, items] of feedbackByDossier.entries()) {
    const text = items.map((item) => JSON.stringify(item)).join("\n") + "\n";
    await writeFile(path.join(auditDir, `${dossierId}.feedback.jsonl`), text);
  }

  const existingLibrary = await loadLibrary(auditDir);
  const mergedEntries = mergeEntries(existingLibrary.entries, entries).map((entry) => {
    const feedbackItems = feedbackByDossier.get(entry.id) ?? [];
    if (!feedbackItems.length) return entry;
    return {
      ...entry,
      feedback_count: feedbackItems.length,
      latest_feedback_rating: feedbackItems[0].rating
    };
  });

  await writeJson(path.join(auditDir, LIBRARY_FILE), {
    schema_version: "0.1.0",
    imported_at: isoNow(),
    audit_dir: auditDir,
    entries: mergedEntries
  });

  return {
    input,
    audit_dir: auditDir,
    dossier_count: entries.length,
    feedback_count: imported.feedback?.length ?? 0
  };
}

function toolByName(dossier: any, toolName: string) {
  return dossier.tool_outputs.find((output: any) => output.tool_name === toolName);
}

export async function monitorWorkspace({
  auditDir = "audits",
  now = isoNow(),
  prices = {}
}: {
  auditDir?: string;
  now?: string;
  prices?: Record<string, number>;
} = {}) {
  const library = await loadLibrary(auditDir);
  const entries = [];

  for (const entry of library.entries) {
    if (!entry.audit_path) {
      entries.push({
        dossier_id: entry.id,
        symbol: entry.symbol,
        status: "missing_audit",
        previous_state: entry.thesis_state,
        current_state: entry.thesis_state,
        fired_triggers: []
      });
      continue;
    }

    const bundle = await readAuditBundle(entry.audit_path);
    const dossier = bundle.dossier;
    const returns = toolByName(dossier, "return_summary");
    const volatility = toolByName(dossier, "volatility_check");
    const lastPrice = prices[dossier.symbol] ?? returns?.result?.latest_close;
    const updated = evaluateLifecycle(dossier.lifecycle, {
      now,
      last_price: lastPrice,
      annualized_volatility_20: volatility?.result?.annualized_volatility_20 ?? 0,
      material_event_arrives: false
    });

    entries.push({
      dossier_id: dossier.id,
      symbol: dossier.symbol,
      action_class: dossier.decision_packet.action_class,
      status: updated.state === dossier.lifecycle.state && updated.fired_triggers.length === 0 ? "unchanged" : "attention",
      previous_state: dossier.lifecycle.state,
      current_state: updated.state,
      freshness_score: updated.freshness_score,
      checked_price: lastPrice,
      expires_at: updated.expires_at,
      fired_triggers: updated.fired_triggers,
      audit_path: entry.audit_path
    });
  }

  const attention = entries.filter((entry: any) => entry.status === "attention");
  return {
    checked_at: now,
    audit_dir: auditDir,
    dossier_count: entries.length,
    attention_count: attention.length,
    entries
  };
}
