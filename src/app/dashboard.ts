import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { productPolicySnapshot } from "../product/policy.js";
import {
  listLibraryEntries,
  monitorWorkspace,
  summarizeFeedback
} from "../library/store.js";

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stateClass(value: string) {
  if (["invalidated", "no_trade", "blocked", "failed", "attention"].includes(value)) return "bad";
  if (["stale", "research_needed", "warning", "needs_reframe"].includes(value)) return "warn";
  if (["active", "watchlist", "paper_trade_candidate", "allowed", "passed", "unchanged"].includes(value)) return "good";
  return "neutral";
}

function metric(label: string, value: any, hint = "") {
  return `<section class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong>${hint ? `<small>${escapeHtml(hint)}</small>` : ""}</section>`;
}

function badge(value: string) {
  return `<span class="badge ${stateClass(value)}">${escapeHtml(value)}</span>`;
}

function renderDossierRows(entries: any[]) {
  if (!entries.length) {
    return `<tr><td colspan="8" class="empty">No dossiers in this local workspace.</td></tr>`;
  }
  return entries.map((entry) => `
    <tr>
      <td><strong>${escapeHtml(entry.symbol)}</strong><span>${escapeHtml(entry.horizon)}</span></td>
      <td>${escapeHtml(entry.thesis)}</td>
      <td>${badge(entry.action_class)}</td>
      <td>${badge(entry.thesis_state)}</td>
      <td>${escapeHtml(entry.confidence)}</td>
      <td>${escapeHtml(entry.freshness_score)}</td>
      <td>${badge(entry.policy_status)}</td>
      <td><code>${escapeHtml(entry.audit_path)}</code></td>
    </tr>
  `).join("");
}

function renderAlertRows(entries: any[]) {
  if (!entries.length) {
    return `<tr><td colspan="5" class="empty">No saved theses to scan.</td></tr>`;
  }
  return entries.map((entry: any) => `
    <tr>
      <td><strong>${escapeHtml(entry.symbol)}</strong></td>
      <td>${badge(entry.status)}</td>
      <td>${escapeHtml(entry.previous_state)} -> ${escapeHtml(entry.current_state)}</td>
      <td>${escapeHtml(entry.fired_triggers?.length ?? 0)}</td>
      <td><code>${escapeHtml(entry.audit_path ?? "")}</code></td>
    </tr>
  `).join("");
}

function renderFeedback(summary: any) {
  const rows = Object.entries(summary.by_rating)
    .map(([rating, count]) => `<tr><td>${badge(rating)}</td><td>${count}</td></tr>`)
    .join("");
  const latest = summary.latest
    .map((item: any) => `<li><strong>${escapeHtml(item.rating)}</strong> ${escapeHtml(item.dossier_id)} <span>${escapeHtml(item.notes)}</span></li>`)
    .join("");
  return `
    <div class="split">
      <table>
        <thead><tr><th>Rating</th><th>Count</th></tr></thead>
        <tbody>${rows || `<tr><td colspan="2" class="empty">No feedback recorded.</td></tr>`}</tbody>
      </table>
      <ul class="feedback">${latest || `<li class="empty">No notes yet.</li>`}</ul>
    </div>
  `;
}

export async function buildDashboardHtml({
  auditDir = "audits",
  now,
  prices = {}
}: {
  auditDir?: string;
  now?: string;
  prices?: Record<string, number>;
} = {}) {
  const library = await listLibraryEntries({ auditDir });
  const alerts = await monitorWorkspace({ auditDir, now, prices });
  const feedback = await summarizeFeedback(auditDir);
  const policy = productPolicySnapshot();
  const watchlist = library.entries.filter((entry: any) =>
    ["watchlist", "paper_trade_candidate"].includes(entry.action_class) &&
    ["active", "stale"].includes(entry.thesis_state)
  );

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parallax Local Alpha</title>
  <style>
    :root {
      color-scheme: light;
      --bg: oklch(0.974 0.006 238);
      --panel: oklch(0.996 0.004 238);
      --panel-2: oklch(0.946 0.007 238);
      --text: oklch(0.238 0.018 238);
      --muted: oklch(0.492 0.018 238);
      --border: oklch(0.872 0.012 238);
      --accent: oklch(0.516 0.137 218);
      --good: oklch(0.455 0.103 158);
      --warn: oklch(0.604 0.116 72);
      --bad: oklch(0.552 0.157 29);
      --shadow: 0 16px 36px oklch(0.42 0.04 238 / 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      font-size: 14px;
      line-height: 1.45;
    }
    header {
      border-bottom: 1px solid var(--border);
      background: var(--panel);
      padding: 18px 24px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 18px;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    header h1 { margin: 0; font-size: 20px; letter-spacing: 0; }
    header p { margin: 4px 0 0; color: var(--muted); max-width: 72ch; }
    main {
      display: grid;
      grid-template-columns: 240px minmax(0, 1fr);
      min-height: calc(100vh - 78px);
    }
    aside {
      border-right: 1px solid var(--border);
      background: var(--panel-2);
      padding: 20px;
    }
    aside a {
      display: block;
      color: var(--text);
      text-decoration: none;
      padding: 8px 0;
      border-bottom: 1px solid oklch(0.89 0.01 238);
    }
    .content { padding: 24px; min-width: 0; }
    .metrics {
      display: grid;
      grid-template-columns: repeat(4, minmax(140px, 1fr));
      gap: 12px;
      margin-bottom: 24px;
    }
    .metric, .section {
      background: var(--panel);
      border: 1px solid var(--border);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .metric { padding: 14px 16px; min-height: 92px; }
    .metric span, .metric small { display: block; color: var(--muted); }
    .metric strong { display: block; margin-top: 8px; font-size: 24px; letter-spacing: 0; }
    .section { margin-bottom: 18px; overflow: hidden; }
    .section h2 {
      margin: 0;
      padding: 14px 16px;
      font-size: 15px;
      border-bottom: 1px solid var(--border);
      background: oklch(0.988 0.004 238);
    }
    .section .body { padding: 16px; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      text-align: left;
      vertical-align: top;
      border-bottom: 1px solid var(--border);
      padding: 10px 12px;
      overflow-wrap: anywhere;
    }
    th { color: var(--muted); font-weight: 650; font-size: 12px; }
    td span { display: block; color: var(--muted); }
    code {
      font-family: "SFMono-Regular", Consolas, monospace;
      font-size: 12px;
      color: oklch(0.35 0.058 238);
    }
    .badge {
      display: inline-block;
      border-radius: 999px;
      padding: 2px 8px;
      font-size: 12px;
      border: 1px solid var(--border);
      background: var(--panel-2);
      color: var(--muted);
      white-space: nowrap;
    }
    .badge.good { color: var(--good); border-color: oklch(0.78 0.07 158); background: oklch(0.96 0.022 158); }
    .badge.warn { color: var(--warn); border-color: oklch(0.82 0.09 72); background: oklch(0.97 0.025 72); }
    .badge.bad { color: var(--bad); border-color: oklch(0.8 0.08 29); background: oklch(0.965 0.028 29); }
    .split { display: grid; grid-template-columns: minmax(220px, 0.6fr) 1fr; gap: 18px; }
    .feedback { margin: 0; padding-left: 18px; }
    .feedback li { margin-bottom: 10px; }
    .empty { color: var(--muted); }
    @media (max-width: 860px) {
      header { position: static; display: block; }
      main { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--border); }
      .metrics { grid-template-columns: repeat(2, minmax(140px, 1fr)); }
      .split { grid-template-columns: 1fr; }
    }
    @media (max-width: 560px) {
      .content { padding: 14px; }
      .metrics { grid-template-columns: 1fr; }
      th:nth-child(5), td:nth-child(5), th:nth-child(6), td:nth-child(6), th:nth-child(8), td:nth-child(8) { display: none; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Parallax Local Alpha</h1>
      <p>${escapeHtml(policy.positioning.public_description)}</p>
    </div>
    ${badge(policy.positioning.product_rule)}
  </header>
  <main>
    <aside>
      <strong>Workspace</strong>
      <a href="#library">Dossier Library</a>
      <a href="#alerts">Lifecycle Alerts</a>
      <a href="#feedback">Alpha Feedback</a>
      <a href="#boundary">Product Boundary</a>
    </aside>
    <section class="content">
      <div class="metrics">
        ${metric("Dossiers", library.entries.length, auditDir)}
        ${metric("Watchlist", watchlist.length, "active or stale")}
        ${metric("Need Attention", alerts.attention_count, alerts.checked_at)}
        ${metric("Feedback", feedback.feedback_count, "local alpha notes")}
      </div>

      <section class="section" id="library">
        <h2>Dossier Library</h2>
        <table>
          <thead><tr><th>Symbol</th><th>Thesis</th><th>Action</th><th>State</th><th>Confidence</th><th>Freshness</th><th>Policy</th><th>Audit</th></tr></thead>
          <tbody>${renderDossierRows(library.entries)}</tbody>
        </table>
      </section>

      <section class="section" id="alerts">
        <h2>Lifecycle Alerts</h2>
        <table>
          <thead><tr><th>Symbol</th><th>Status</th><th>State Change</th><th>Triggers</th><th>Audit</th></tr></thead>
          <tbody>${renderAlertRows(alerts.entries)}</tbody>
        </table>
      </section>

      <section class="section" id="feedback">
        <h2>Alpha Feedback</h2>
        <div class="body">${renderFeedback(feedback)}</div>
      </section>

      <section class="section" id="boundary">
        <h2>Product Boundary</h2>
        <div class="body">
          <p><strong>Legal posture:</strong> ${escapeHtml(policy.positioning.legal_posture)}</p>
          <p><strong>Allowed actions:</strong> ${policy.allowed_action_classes.map((item: string) => badge(item)).join(" ")}</p>
          <p><strong>Excluded:</strong> ${policy.excluded_action_classes.map((item: string) => badge(item)).join(" ")}</p>
        </div>
      </section>
    </section>
  </main>
</body>
</html>
`;
}

export async function writeDashboard({
  auditDir = "audits",
  out = path.join(auditDir, "parallax-dashboard.html"),
  now,
  prices = {}
}: {
  auditDir?: string;
  out?: string;
  now?: string;
  prices?: Record<string, number>;
} = {}) {
  const html = await buildDashboardHtml({ auditDir, now, prices });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  return {
    out,
    bytes: Buffer.byteLength(html),
    audit_dir: auditDir
  };
}
