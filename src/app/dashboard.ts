import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { productPolicySnapshot } from "../product/policy.js";
import { paperLedgerReport } from "../paper/lab.js";
import {
  listLibraryEntries,
  monitorWorkspace,
  sourceViewFromAudit,
  summarizeFeedback
} from "../library/store.js";
import { readAlertPreferences, readLifecycleNotifications } from "../lifecycle/workspace.js";
import { buildGovernanceReport } from "../team/governance.js";

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stateClass(value: string) {
  if (["invalidated", "no_trade", "blocked", "failed", "attention"].includes(value)) return "bad";
  if (["stale", "research_needed", "warning", "needs_reframe", "needs_review", "changes_requested"].includes(value)) return "warn";
  if (["active", "watchlist", "paper_trade_candidate", "allowed", "passed", "unchanged", "ready", "release_ready", "approved"].includes(value)) return "good";
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
    return `<tr><td colspan="7" class="empty">No saved theses to scan.</td></tr>`;
  }
  return entries.map((entry: any) => `
    <tr>
      <td><strong>${escapeHtml(entry.symbol)}</strong></td>
      <td>${badge(entry.status)}</td>
      <td>${escapeHtml(entry.previous_state)} -> ${escapeHtml(entry.current_state)}</td>
      <td>${escapeHtml(entry.fired_triggers?.length ?? 0)}</td>
      <td>${badge(entry.change_since_last_run?.status ?? "n/a")}</td>
      <td>${entry.muted ? badge("muted") : badge("on")}</td>
      <td><code>${escapeHtml(entry.audit_path ?? "")}</code></td>
    </tr>
  `).join("");
}

function renderNotificationRows(notifications: any[]) {
  if (!notifications.length) {
    return `<tr><td colspan="5" class="empty">No lifecycle notifications.</td></tr>`;
  }
  return notifications.slice(0, 12).map((item: any) => `
    <tr>
      <td><strong>${escapeHtml(item.symbol)}</strong><span>${escapeHtml(item.created_at)}</span></td>
      <td>${badge(item.severity)}</td>
      <td>${badge(item.current_state)}</td>
      <td>${escapeHtml(item.message)}</td>
      <td><code>${escapeHtml(item.audit_path ?? "")}</code></td>
    </tr>
  `).join("");
}

function renderPaperRows(trades: any[]) {
  if (!trades.length) {
    return `<tr><td colspan="7" class="empty">No paper trades in this workspace.</td></tr>`;
  }
  return trades.map((trade: any) => `
    <tr>
      <td><strong>${escapeHtml(trade.symbol)}</strong><span>${escapeHtml(trade.id)}</span></td>
      <td>${badge(trade.status)}</td>
      <td>${escapeHtml(trade.side)}</td>
      <td>${escapeHtml(trade.ticket.quantity)}</td>
      <td>${escapeHtml(trade.filled.fill_price)}</td>
      <td>${trade.status === "closed" ? escapeHtml(trade.closed.exit_price) : escapeHtml(trade.reserved_notional)}</td>
      <td>${trade.status === "closed" ? escapeHtml(trade.realized_pnl) : badge("simulation_only")}</td>
    </tr>
  `).join("");
}

function renderGovernanceRows(releaseControls: any[]) {
  if (!releaseControls.length) {
    return `<tr><td colspan="7" class="empty">No dossiers available for team release review.</td></tr>`;
  }
  return releaseControls.map((control: any) => `
    <tr>
      <td><strong>${escapeHtml(control.symbol)}</strong><span>${escapeHtml(control.dossier_id)}</span></td>
      <td>${badge(control.action_class)}</td>
      <td>${badge(control.status)}</td>
      <td>${control.registry_validation.passed ? badge("passed") : badge("failed")}</td>
      <td>${escapeHtml(control.approved_review_types.join(", ") || "none")}</td>
      <td>${escapeHtml(control.missing_review_types.join(", ") || "none")}</td>
      <td><code>${escapeHtml(control.audit_path)}</code></td>
    </tr>
  `).join("");
}

function renderAssignmentRows(assignments: any[]) {
  if (!assignments.length) {
    return `<tr><td colspan="5" class="empty">No team review assignments.</td></tr>`;
  }
  return assignments.slice(-12).map((assignment: any) => `
    <tr>
      <td><strong>${escapeHtml(assignment.symbol)}</strong><span>${escapeHtml(assignment.id)}</span></td>
      <td>${escapeHtml(assignment.review_type)}</td>
      <td>${escapeHtml(assignment.assignee)}</td>
      <td>${badge(assignment.status)}</td>
      <td>${escapeHtml(assignment.note)}</td>
    </tr>
  `).join("");
}

function renderSourceRows(sourceViews: any[]) {
  const sources = sourceViews.flatMap((view: any) =>
    view.sources.map((source: any) => ({ ...source, dossier_id: view.dossier_id }))
  );
  if (!sources.length) {
    return `<tr><td colspan="7" class="empty">No source metadata available.</td></tr>`;
  }
  return sources.map((source: any) => `
    <tr>
      <td><strong>${escapeHtml(source.kind)}</strong><span>${escapeHtml(source.symbol)}</span></td>
      <td>${escapeHtml(source.source)}</td>
      <td>${escapeHtml(source.as_of)}</td>
      <td>${badge(source.freshness_status)}</td>
      <td>${badge(source.license)}</td>
      <td>${escapeHtml(JSON.stringify(source.payload_summary ?? {}))}</td>
      <td><code>${escapeHtml(source.hash)}</code></td>
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
  prices = {},
  events = {},
  annualizedVolatility = {}
}: {
  auditDir?: string;
  now?: string;
  prices?: Record<string, number>;
  events?: Record<string, boolean>;
  annualizedVolatility?: Record<string, number>;
} = {}) {
  const library = await listLibraryEntries({ auditDir });
  const alerts = await monitorWorkspace({
    auditDir,
    now,
    prices,
    events,
    annualizedVolatility,
    persist: false,
    notify: false
  });
  const feedback = await summarizeFeedback(auditDir);
  const preferences = await readAlertPreferences(auditDir);
  const notifications = await readLifecycleNotifications(auditDir);
  const paper = await paperLedgerReport(auditDir);
  const governance = await buildGovernanceReport(auditDir);
  const policy = productPolicySnapshot();
  const sourceViews = [];
  for (const entry of library.entries) {
    if (!entry.audit_path) continue;
    try {
      sourceViews.push(await sourceViewFromAudit(entry.audit_path));
    } catch {
      // The dashboard should still render if one local audit is missing.
    }
  }
  const sourceCount = sourceViews.reduce((sum, view: any) => sum + view.sources.length, 0);
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
      <a href="#notifications">Notification Inbox</a>
      <a href="#paper">Paper Lab</a>
      <a href="#governance">Team Governance</a>
      <a href="#sources">Data Freshness</a>
      <a href="#feedback">Alpha Feedback</a>
      <a href="#boundary">Product Boundary</a>
    </aside>
    <section class="content">
      <div class="metrics">
        ${metric("Dossiers", library.entries.length, auditDir)}
        ${metric("Watchlist", watchlist.length, "active or stale")}
        ${metric("Need Attention", alerts.attention_count, alerts.checked_at)}
        ${metric("Data Sources", sourceCount, "evidence items")}
        ${metric("Feedback", feedback.feedback_count, "local alpha notes")}
        ${metric("Notifications", notifications.notifications.length, preferences.channels.join(", "))}
        ${metric("Paper PnL", paper.summary.realized_pnl, `${paper.summary.open_count} open / ${paper.summary.closed_count} closed`)}
        ${metric("Release Ready", governance.summary.release_ready_count, `${governance.summary.open_assignment_count} open reviews`)}
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
          <thead><tr><th>Symbol</th><th>Status</th><th>State Change</th><th>Triggers</th><th>Since Last Run</th><th>Alerts</th><th>Audit</th></tr></thead>
          <tbody>${renderAlertRows(alerts.entries)}</tbody>
        </table>
      </section>

      <section class="section" id="notifications">
        <h2>Notification Inbox</h2>
        <table>
          <thead><tr><th>Symbol</th><th>Severity</th><th>State</th><th>Message</th><th>Audit</th></tr></thead>
          <tbody>${renderNotificationRows(notifications.notifications)}</tbody>
        </table>
      </section>

      <section class="section" id="paper">
        <h2>Paper Lab</h2>
        <table>
          <thead><tr><th>Symbol</th><th>Status</th><th>Side</th><th>Qty</th><th>Entry</th><th>Exit/Reserved</th><th>Outcome</th></tr></thead>
          <tbody>${renderPaperRows(paper.ledger.trades)}</tbody>
        </table>
      </section>

      <section class="section" id="governance">
        <h2>Team Governance</h2>
        <div class="body">
          <p><strong>Workspace:</strong> ${escapeHtml(governance.summary.workspace_name)}</p>
          <p><strong>SOC 2 readiness:</strong> ${badge(governance.soc2_readiness.status)}</p>
        </div>
        <table>
          <thead><tr><th>Symbol</th><th>Action</th><th>Release</th><th>Registry</th><th>Approved</th><th>Missing</th><th>Audit</th></tr></thead>
          <tbody>${renderGovernanceRows(governance.release_controls)}</tbody>
        </table>
        <table>
          <thead><tr><th>Symbol</th><th>Review</th><th>Assignee</th><th>Status</th><th>Note</th></tr></thead>
          <tbody>${renderAssignmentRows(governance.assignments)}</tbody>
        </table>
      </section>

      <section class="section" id="sources">
        <h2>Data Freshness</h2>
        <table>
          <thead><tr><th>Kind</th><th>Source</th><th>As Of</th><th>Freshness</th><th>License</th><th>Payload</th><th>Hash</th></tr></thead>
          <tbody>${renderSourceRows(sourceViews)}</tbody>
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
  prices = {},
  events = {},
  annualizedVolatility = {}
}: {
  auditDir?: string;
  out?: string;
  now?: string;
  prices?: Record<string, number>;
  events?: Record<string, boolean>;
  annualizedVolatility?: Record<string, number>;
} = {}) {
  const html = (await buildDashboardHtml({ auditDir, now, prices, events, annualizedVolatility })).replace(/[ \t]+$/gm, "");
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  return {
    out,
    bytes: Buffer.byteLength(html),
    audit_dir: auditDir
  };
}
