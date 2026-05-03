import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { managedSaasConfigPath, managedSaasStatus } from "../saas/managed.js";
import { providerValidationPath, validateProviderContracts } from "../providers/validation.js";
import { tenantPersistenceStatus } from "../saas/persistence.js";
import { identityStatus } from "../saas/identity.js";
import { durableStorageStatus } from "../saas/storage.js";
import { dataVendorStatus } from "../saas/data_vendor.js";
import { llmProviderStatus } from "../saas/llm_provider.js";
import { connectorRepairStatus } from "../saas/setup_repair.js";
import { workspaceOnboardingStatus } from "../saas/onboarding.js";

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJson(value: any) {
  return escapeHtml(JSON.stringify(value));
}

function stateClass(value: string) {
  const normalized = String(value ?? "").toLowerCase();
  if (["blocked", "failed", "enabled_production", "missing", "forbidden", "unauthorized", "expired", "revoked"].includes(normalized)) return "bad";
  if (normalized.includes("blocked") || normalized.includes("failed")) return "bad";
  if (["warning", "pending", "not_validated", "disabled_until_configured", "disabled_until_legal_approval"].includes(normalized)) return "warn";
  if (normalized.includes("ready_for") || ["accepted", "contract_validated", "passed", "active", "ok"].includes(normalized)) return "good";
  return "neutral";
}

function badge(value: any) {
  const text = String(value ?? "unknown");
  return `<span class="badge ${stateClass(text)}">${escapeHtml(text)}</span>`;
}

function row(label: string, value: any) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
}

function statusMetric(label: string, value: any, detail = "") {
  return `
    <section class="metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
      ${detail ? `<em>${escapeHtml(detail)}</em>` : ""}
    </section>
  `;
}

function providerRows(providers: any[]) {
  if (!providers.length) {
    return `<tr><td colspan="7" class="empty">No provider manifests registered.</td></tr>`;
  }
  return providers.map((provider: any) => `
    <tr>
      <td><strong>${escapeHtml(provider.name)}</strong><span>${escapeHtml(provider.kind)}</span></td>
      <td>${escapeHtml(provider.provider)}</td>
      <td>${badge(provider.status)}</td>
      <td>${badge(provider.manifest_status)}</td>
      <td>${badge(provider.validation_status)}</td>
      <td>${escapeHtml(provider.secret_ref_name)}</td>
      <td>${escapeHtml(provider.required_failure_count)}</td>
    </tr>
  `).join("");
}

function tenantRows(tenants: any[]) {
  if (!tenants.length) {
    return `<tr><td colspan="7" class="empty">No tenants configured.</td></tr>`;
  }
  return tenants.map((tenant: any) => `
    <tr>
      <td><strong>${escapeHtml(tenant.tenant_name ?? tenant.name)}</strong><span>${escapeHtml(tenant.tenant_slug ?? tenant.slug)}</span></td>
      <td>${badge(tenant.status)}</td>
      <td>${escapeHtml(tenant.dossier_count ?? 0)}</td>
      <td>${escapeHtml(tenant.event_count ?? 0)}</td>
      <td>${escapeHtml(tenant.state_key_count ?? 0)}</td>
      <td>${escapeHtml(tenant.latest_event?.event_type ?? "none")}</td>
      <td><code>${escapeHtml(tenant.audit_dir)}</code></td>
    </tr>
  `).join("");
}

function controlRows(controls: any[]) {
  if (!controls.length) {
    return `<tr><td colspan="4" class="empty">No controls reported.</td></tr>`;
  }
  return controls.map((control: any) => `
    <tr>
      <td><code>${escapeHtml(control.id)}</code></td>
      <td>${badge(control.passed ? "passed" : "failed")}</td>
      <td>${badge(control.severity)}</td>
      <td>${escapeHtml(control.detail)}</td>
    </tr>
  `).join("");
}

function setupRows(steps: any[]) {
  return steps.map((step: any, index: number) => `
    <li class="${stateClass(step.status)}">
      <span class="step-index">${index + 1}</span>
      <div>
        <strong>${escapeHtml(step.label)}</strong>
        <span>${escapeHtml(step.detail)}</span>
        <code>${escapeHtml(step.command)}</code>
      </div>
      ${badge(step.status)}
    </li>
  `).join("");
}

function boundaryRows(rows: any[]) {
  return rows.map((item: any) => `
    <tr>
      <td><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></td>
      <td>${badge(item.status)}</td>
      <td>${escapeHtml(item.counts)}</td>
      <td>${escapeHtml(item.safety)}</td>
    </tr>
  `).join("");
}

function renderOptions(values: string[]) {
  return values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join("");
}

function miniRows(rows: any[]) {
  if (!rows.length) return `<p class="empty inline-empty">No records yet.</p>`;
  return rows.map((item) => `
    <div class="mini-row">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.detail)}</span>
      ${badge(item.status)}
    </div>
  `).join("");
}

function repairRows(actions: any[]) {
  return actions.map((item: any) => `
    <div class="repair-row ${stateClass(item.status)}">
      <div>
        <strong>${escapeHtml(item.label)}</strong>
        <span>${escapeHtml(item.detail)}</span>
        <code>${escapeHtml(item.command)}</code>
      </div>
      <div class="repair-state">
        ${badge(item.status)}
        ${item.block_reason ? `<span>${escapeHtml(item.block_reason)}</span>` : ""}
      </div>
    </div>
  `).join("");
}

function invitationRows(invitations: any[]) {
  if (!invitations.length) return `<p class="empty inline-empty">No workspace invitations yet.</p>`;
  return invitations.slice(-8).reverse().map((item: any) => `
    <div class="mini-row">
      <div>
        <strong>${escapeHtml(item.email)}</strong>
        <span>${escapeHtml(`${item.tenant_slug} | ${item.role} | expires ${item.expires_at}`)}</span>
      </div>
      ${badge(item.status)}
    </div>
  `).join("");
}

export async function buildHostedConsoleHtml({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  validationPath = providerValidationPath(rootDir),
  apiTokenHash = "",
  now
}: {
  rootDir?: string;
  configPath?: string;
  validationPath?: string;
  apiTokenHash?: string;
  now?: string;
} = {}) {
  const providerValidation = await validateProviderContracts({
    rootDir,
    configPath,
    out: validationPath,
    now
  });
  const saas = await managedSaasStatus({ rootDir, configPath, now });
  const persistence = await tenantPersistenceStatus({ rootDir, configPath, now });
  const identity = await identityStatus({ rootDir, configPath, now });
  const storage = await durableStorageStatus({ rootDir, configPath, now });
  const dataVendor = await dataVendorStatus({ rootDir, configPath, now });
  const llmProvider = await llmProviderStatus({ rootDir, configPath, now });
  const repair = await connectorRepairStatus({ rootDir, configPath, apiTokenHash, now });
  const onboarding = await workspaceOnboardingStatus({ rootDir, configPath, now });
  const readiness = saas.readiness;
  const generatedAt = now ?? providerValidation.generated_at;
  const hostedApiReady = Boolean(apiTokenHash) &&
    providerValidation.status === "ready_for_provider_contract_beta" &&
    persistence.status === "ready_for_tenant_persistence";
  const foundationReady = hostedApiReady &&
    identity.status === "ready_for_identity_foundation" &&
    storage.status === "ready_for_durable_storage_foundation";
  const tenantSlugs = persistence.tenants.map((tenant: any) => tenant.tenant_slug);
  const setup = [
    {
      label: "Control plane",
      status: readiness.status,
      detail: `${readiness.summary.tenant_count} tenants, ${readiness.summary.integration_count} integrations`,
      command: "npm run saas-readiness -- --root-dir managed-saas"
    },
    {
      label: "Provider contracts",
      status: providerValidation.status,
      detail: `${providerValidation.summary.contract_validated_count}/${providerValidation.summary.provider_count} contracts validated`,
      command: "npm run provider-validate -- --root-dir managed-saas"
    },
    {
      label: "Hosted API",
      status: hostedApiReady ? "ready_for_hosted_multi_tenant_api" : "blocked",
      detail: Boolean(apiTokenHash) ? "Bearer auth hash is configured" : "Runtime API token hash is missing",
      command: "npm run hosted-serve -- --root-dir managed-saas --api-token \"$PARALLAX_HOSTED_API_TOKEN\""
    },
    {
      label: "Identity and storage",
      status: foundationReady ? "ready_for_identity_storage_foundation" : "blocked",
      detail: `${identity.summary.principal_count} principals, ${storage.summary.checkpoint_count} storage checkpoints`,
      command: "npm run hosted-foundation-status -- --root-dir managed-saas"
    },
    {
      label: "Workspace onboarding",
      status: onboarding.status,
      detail: `${onboarding.summary.pending_count} pending, ${onboarding.summary.accepted_count} accepted invitations`,
      command: "npm run onboarding-status -- --root-dir managed-saas"
    },
    {
      label: "Data vendor",
      status: dataVendor.status,
      detail: `${dataVendor.summary.adapter_count} adapters, ${dataVendor.summary.import_count} imports`,
      command: "npm run data-vendor-status -- --root-dir managed-saas"
    },
    {
      label: "LLM provider",
      status: llmProvider.status,
      detail: `${llmProvider.summary.adapter_count} adapters, ${llmProvider.summary.run_count} replay runs`,
      command: "npm run llm-provider-status -- --root-dir managed-saas"
    }
  ];

  const boundary = [
    {
      label: "Identity",
      detail: "Hash-only sessions",
      status: identity.status,
      counts: `${identity.summary.principal_count} principals, ${identity.summary.active_session_count} active sessions`,
      safety: `raw tokens: ${identity.summary.raw_session_token_stored ? "stored" : "blocked"}`
    },
    {
      label: "Durable storage",
      detail: "Tenant object manifest",
      status: storage.status,
      counts: `${storage.summary.object_count} objects, ${storage.summary.checkpoint_count} checkpoints`,
      safety: `cloud connection: ${storage.summary.direct_cloud_storage_connection ? "enabled" : "disabled"}`
    },
    {
      label: "Workspace onboarding",
      detail: "Hash-only invitations",
      status: onboarding.status,
      counts: `${onboarding.summary.pending_count} pending, ${onboarding.summary.accepted_count} accepted`,
      safety: `raw invite tokens: ${onboarding.summary.raw_invite_token_stored ? "stored" : "blocked"}`
    },
    {
      label: "Data vendor",
      detail: "Licensed local replay packs",
      status: dataVendor.status,
      counts: `${dataVendor.summary.adapter_count} adapters, ${dataVendor.summary.import_count} imports`,
      safety: `vendor network: ${dataVendor.summary.direct_vendor_network_connection ? "enabled" : "disabled"}`
    },
    {
      label: "LLM provider",
      detail: "External-model replay contracts",
      status: llmProvider.status,
      counts: `${llmProvider.summary.adapter_count} adapters, ${llmProvider.summary.run_count} runs`,
      safety: `model network: ${llmProvider.summary.direct_model_network_connection ? "enabled" : "disabled"}`
    }
  ];

  const recentRuns = [
    ...dataVendor.imports.slice(-3).map((item: any) => ({
      title: `${item.tenant_slug}/${item.symbol}`,
      detail: `data vendor import via ${item.adapter_id}`,
      status: item.data_status_passed ? "passed" : "failed"
    })),
    ...llmProvider.runs.slice(-3).map((item: any) => ({
      title: `${item.tenant_slug}/${item.symbol}`,
      detail: `LLM replay via ${item.adapter_id}`,
      status: item.council_eval_passed ? "passed" : "failed"
    }))
  ].slice(-5).reverse();

  const consoleState = {
    tenantSlugs,
    generatedAt,
    rootDir,
    statuses: {
      managed: readiness.status,
      providers: providerValidation.status,
      identity: identity.status,
      storage: storage.status,
      onboarding: onboarding.status,
      dataVendor: dataVendor.status,
      llmProvider: llmProvider.status
    },
    onboarding: {
      status: onboarding.status,
      summary: onboarding.summary,
      invitations: onboarding.invitations.map((item: any) => ({
        email: item.email,
        tenant_slug: item.tenant_slug,
        role: item.role,
        status: item.status,
        expires_at: item.expires_at
      }))
    },
    repair: {
      status: repair.status,
      nextAction: repair.next_action?.id ?? "",
      actions: repair.actions.map((item: any) => ({
        id: item.id,
        label: item.label,
        status: item.status,
        boundary: item.boundary
      }))
    }
  };

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parallax Hosted Console</title>
  <style>
    :root {
      color-scheme: light;
      --bg: oklch(0.972 0.009 205);
      --shell: oklch(0.947 0.012 205);
      --surface: oklch(0.991 0.005 205);
      --surface-2: oklch(0.963 0.008 205);
      --text: oklch(0.228 0.018 224);
      --muted: oklch(0.48 0.021 224);
      --line: oklch(0.848 0.018 205);
      --accent: oklch(0.48 0.124 187);
      --accent-quiet: oklch(0.925 0.042 187);
      --good: oklch(0.43 0.101 154);
      --good-bg: oklch(0.938 0.043 154);
      --warn: oklch(0.56 0.119 78);
      --warn-bg: oklch(0.956 0.046 78);
      --bad: oklch(0.54 0.154 31);
      --bad-bg: oklch(0.952 0.039 31);
      --shadow: 0 18px 42px oklch(0.35 0.035 225 / 0.08);
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background: var(--bg);
      font-size: 15px;
      line-height: 1.45;
    }
    a { color: inherit; text-decoration: none; }
    .app-shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 248px minmax(0, 1fr);
    }
    aside {
      background: var(--shell);
      border-right: 1px solid var(--line);
      padding: 22px 18px;
      position: sticky;
      top: 0;
      height: 100vh;
    }
    .brand strong {
      display: block;
      font-size: 1.1rem;
      line-height: 1.15;
    }
    .brand span, .muted, .field-note, td span, .mini-row span {
      color: var(--muted);
    }
    nav {
      display: grid;
      gap: 6px;
      margin-top: 26px;
    }
    nav a {
      display: flex;
      min-height: 36px;
      align-items: center;
      padding: 7px 9px;
      border-radius: 7px;
      color: var(--muted);
      font-weight: 650;
      font-size: 0.9rem;
    }
    nav a:hover, nav a:focus-visible {
      color: var(--text);
      background: var(--surface);
      outline: none;
      box-shadow: inset 0 0 0 1px var(--line);
    }
    .side-footer {
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 20px;
      color: var(--muted);
      font-size: 0.78rem;
    }
    main {
      min-width: 0;
      padding: 26px 30px 42px;
      display: grid;
      gap: 22px;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 20px;
      align-items: start;
    }
    h1, h2, h3, p { margin: 0; letter-spacing: 0; }
    h1 { font-size: 1.65rem; line-height: 1.14; }
    h2 { font-size: 1rem; }
    h3 { font-size: 0.92rem; }
    .lead {
      color: var(--muted);
      margin-top: 7px;
      max-width: 72ch;
    }
    .top-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: end;
      flex-wrap: wrap;
    }
    .button, button {
      min-height: 34px;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      padding: 7px 11px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
    }
    .button.primary, button.primary {
      border-color: oklch(0.63 0.09 187);
      background: var(--accent);
      color: oklch(0.985 0.008 187);
    }
    .button:hover, button:hover { background: var(--surface-2); }
    .button.primary:hover, button.primary:hover { background: oklch(0.43 0.13 187); }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible {
      outline: 2px solid oklch(0.57 0.14 187);
      outline-offset: 2px;
    }
    .metrics {
      display: grid;
      grid-template-columns: repeat(7, minmax(120px, 1fr));
      gap: 1px;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: var(--line);
      box-shadow: var(--shadow);
    }
    .metric {
      background: var(--surface);
      min-height: 90px;
      padding: 13px 14px;
    }
    .metric span, th, .section-kicker, label, .step-list code {
      color: var(--muted);
      font-size: 0.76rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .metric strong {
      display: block;
      margin-top: 10px;
      font-size: 1rem;
      overflow-wrap: anywhere;
    }
    .metric em {
      display: block;
      margin-top: 5px;
      color: var(--muted);
      font-style: normal;
      font-size: 0.83rem;
    }
    .layout-2 {
      display: grid;
      grid-template-columns: minmax(0, 1.08fr) minmax(320px, 0.92fr);
      gap: 22px;
      align-items: start;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 14px 16px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--line);
    }
    .panel-body { padding: 16px; }
    .step-list {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 9px;
    }
    .step-list li {
      display: grid;
      grid-template-columns: 30px minmax(0, 1fr) auto;
      gap: 11px;
      align-items: start;
      padding: 11px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: oklch(0.985 0.004 205);
    }
    .step-list li.good { background: var(--good-bg); border-color: oklch(0.82 0.052 154); }
    .step-list li.warn { background: var(--warn-bg); border-color: oklch(0.84 0.06 78); }
    .step-list li.bad { background: var(--bad-bg); border-color: oklch(0.82 0.065 31); }
    .step-index {
      display: inline-grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border: 1px solid var(--line);
      border-radius: 999px;
      background: var(--surface);
      color: var(--muted);
      font-weight: 800;
      font-size: 0.82rem;
    }
    .step-list strong, .mini-row strong { display: block; }
    .step-list span { display: block; color: var(--muted); margin-top: 2px; }
    .step-list code { display: block; margin-top: 7px; text-transform: none; overflow-wrap: anywhere; }
    table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    th, td {
      text-align: left;
      padding: 12px 14px;
      border-bottom: 1px solid var(--line);
      vertical-align: top;
      overflow-wrap: anywhere;
    }
    tbody tr:last-child th, tbody tr:last-child td { border-bottom: 0; }
    td span, td strong { display: block; }
    td span { font-size: 0.82rem; margin-top: 3px; }
    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
      color: oklch(0.34 0.05 225);
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      background: oklch(0.962 0.008 205);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      max-height: 260px;
      overflow: auto;
    }
    .badge {
      display: inline-flex;
      min-height: 24px;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: oklch(0.97 0.006 205);
      font-size: 0.76rem;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge.good { color: var(--good); background: var(--good-bg); border-color: oklch(0.82 0.052 154); }
    .badge.warn { color: var(--warn); background: var(--warn-bg); border-color: oklch(0.84 0.06 78); }
    .badge.bad { color: var(--bad); background: var(--bad-bg); border-color: oklch(0.82 0.065 31); }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .field { display: grid; gap: 6px; }
    .field.wide { grid-column: 1 / -1; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface);
      color: var(--text);
      padding: 9px 10px;
      font: inherit;
    }
    textarea { min-height: 108px; resize: vertical; }
    .field-note { font-size: 0.82rem; }
    .form-actions {
      display: flex;
      gap: 8px;
      align-items: center;
      justify-content: flex-end;
      margin-top: 12px;
      flex-wrap: wrap;
    }
    .mini-list {
      display: grid;
      gap: 9px;
    }
    .mini-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 10px;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 11px;
      background: oklch(0.985 0.004 205);
    }
    .mini-row span { font-size: 0.83rem; }
    .repair-summary {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 12px;
      color: var(--muted);
    }
    .repair-summary strong { color: var(--text); }
    .repair-list {
      display: grid;
      gap: 9px;
    }
    .repair-row {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(130px, auto);
      gap: 12px;
      align-items: start;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 11px;
      background: oklch(0.985 0.004 205);
    }
    .repair-row.good { background: var(--good-bg); border-color: oklch(0.82 0.052 154); }
    .repair-row.warn { background: var(--warn-bg); border-color: oklch(0.84 0.06 78); }
    .repair-row.bad { background: var(--bad-bg); border-color: oklch(0.82 0.065 31); }
    .repair-row span, .repair-state span {
      display: block;
      color: var(--muted);
      font-size: 0.83rem;
      margin-top: 3px;
    }
    .repair-row code {
      display: block;
      margin-top: 7px;
      overflow-wrap: anywhere;
    }
    .repair-state {
      display: grid;
      justify-items: end;
      gap: 5px;
      text-align: right;
    }
    .empty, .inline-empty { color: var(--muted); }
    .result {
      display: grid;
      gap: 9px;
    }
    .result-line {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      border-bottom: 1px solid var(--line);
      padding-bottom: 8px;
    }
    .result-line:last-child { border-bottom: 0; padding-bottom: 0; }
    @media (max-width: 1120px) {
      .app-shell { grid-template-columns: 1fr; }
      aside {
        position: static;
        height: auto;
        border-right: 0;
        border-bottom: 1px solid var(--line);
      }
      nav { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .side-footer { position: static; margin-top: 18px; }
      .layout-2, header { grid-template-columns: 1fr; }
      .metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    }
    @media (max-width: 720px) {
      main { padding: 18px 14px 28px; }
      nav { grid-template-columns: 1fr 1fr; }
      .metrics, .form-grid { grid-template-columns: 1fr; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid var(--line); }
      th, td { border-bottom: 0; }
      .step-list li, .mini-row, .repair-row { grid-template-columns: 1fr; }
      .repair-state { justify-items: start; text-align: left; }
      .top-actions, .form-actions { justify-content: stretch; }
      .top-actions .button, .form-actions button { width: 100%; }
    }
  </style>
</head>
<body>
  <div class="app-shell">
    <aside>
      <div class="brand">
        <strong>Parallax</strong>
        <span>Hosted Research Console</span>
      </div>
      <nav aria-label="Primary">
        <a href="#overview">Overview</a>
        <a href="#setup">Setup</a>
        <a href="#repair">Repair</a>
        <a href="#onboarding">Onboarding</a>
        <a href="#analysis">Analysis</a>
        <a href="#tenants">Tenants</a>
        <a href="#providers">Providers</a>
        <a href="#controls">Controls</a>
      </nav>
      <div class="side-footer">Generated ${escapeHtml(generatedAt)}</div>
    </aside>
    <main>
      <header id="overview">
        <div>
          <p class="section-kicker">Parallax Hosted Console</p>
          <h1>Research readiness and tenant analysis workspace</h1>
          <p class="lead">${escapeHtml(saas.environment)} | ${escapeHtml(rootDir)}</p>
        </div>
        <div class="top-actions">
          ${badge(providerValidation.status)}
          <a class="button" href="/readyz">Readiness JSON</a>
          <a class="button" href="/api/control-plane">Control Plane JSON</a>
        </div>
      </header>

      <section class="metrics" aria-label="Readiness metrics">
        ${statusMetric("Managed", readiness.status, `${readiness.summary.tenant_count} tenants`)}
        ${statusMetric("Providers", providerValidation.summary.contract_validated_count + " / " + providerValidation.summary.provider_count, providerValidation.status)}
        ${statusMetric("Identity", identity.summary.principal_count, identity.status)}
        ${statusMetric("Storage", storage.summary.checkpoint_count, storage.status)}
        ${statusMetric("Onboarding", onboarding.summary.accepted_count, onboarding.status)}
        ${statusMetric("Data Vendor", dataVendor.summary.import_count, dataVendor.status)}
        ${statusMetric("LLM Provider", llmProvider.summary.run_count, llmProvider.status)}
      </section>

      <div class="layout-2">
        <section class="panel" id="setup">
          <div class="panel-head">
            <h2>Readiness Checklist</h2>
            <span class="section-kicker">Phase 17</span>
          </div>
          <div class="panel-body">
            <ol class="step-list">${setupRows(setup)}</ol>
          </div>
        </section>

        <section class="panel" id="repair">
          <div class="panel-head">
            <h2>Guided Repair</h2>
            <span class="section-kicker">${escapeHtml(repair.status)}</span>
          </div>
          <div class="panel-body">
            <div class="repair-summary">
              <strong>${escapeHtml(repair.summary.complete_count)} / ${escapeHtml(repair.summary.action_count)} complete</strong>
              <span>Next: ${escapeHtml(repair.next_action?.label ?? "No repair needed")}</span>
            </div>
            <div class="repair-list" id="repair-list">${repairRows(repair.actions)}</div>
            <div class="form-actions">
              <button type="button" id="preview-repair">Preview repair plan</button>
              <button type="button" id="apply-next-repair" class="primary">Apply next repair</button>
            </div>
            <div id="repair-result" class="result" aria-live="polite">
              <p class="empty">Guided repair uses local contracts only and does not store raw secrets.</p>
            </div>
          </div>
        </section>
      </div>

      <section class="panel" id="onboarding">
        <div class="panel-head">
          <h2>Workspace Onboarding</h2>
          <span class="section-kicker">${escapeHtml(onboarding.status)}</span>
        </div>
        <div class="panel-body">
          <div class="repair-summary">
            <strong>${escapeHtml(onboarding.summary.pending_count)} pending | ${escapeHtml(onboarding.summary.accepted_count)} accepted</strong>
            <span>Invite and session tokens are shown once and stored as hashes only.</span>
          </div>
          <div class="layout-2">
            <form id="invite-form" class="form-grid">
              <div class="field">
                <label for="invite-email">Email</label>
                <input id="invite-email" type="email" autocomplete="off" placeholder="analyst@example.com">
              </div>
              <div class="field">
                <label for="invite-name">Name</label>
                <input id="invite-name" autocomplete="off" placeholder="Analyst">
              </div>
              <div class="field">
                <label for="invite-tenant">Tenant</label>
                <select id="invite-tenant">${renderOptions(tenantSlugs)}</select>
              </div>
              <div class="field">
                <label for="invite-role">Role</label>
                <select id="invite-role">
                  <option value="analyst">analyst</option>
                  <option value="tenant_admin">tenant_admin</option>
                  <option value="reviewer">reviewer</option>
                </select>
              </div>
              <div class="field wide">
                <label for="invite-ttl">Invite TTL minutes</label>
                <input id="invite-ttl" type="number" min="5" max="10080" value="10080">
              </div>
              <div class="field wide">
                <div class="form-actions">
                  <button type="button" id="refresh-onboarding">Refresh onboarding</button>
                  <button type="submit" class="primary">Create invite</button>
                </div>
              </div>
            </form>

            <form id="accept-invite-form" class="form-grid">
              <div class="field wide">
                <label for="invite-token">Invite token</label>
                <input id="invite-token" autocomplete="off" placeholder="pinv_...">
              </div>
              <div class="field">
                <label for="accept-email">Email</label>
                <input id="accept-email" type="email" autocomplete="off" placeholder="optional match">
              </div>
              <div class="field">
                <label for="accept-name">Name</label>
                <input id="accept-name" autocomplete="off" placeholder="optional display name">
              </div>
              <div class="field wide">
                <div class="form-actions">
                  <button type="submit" class="primary">Accept invite</button>
                </div>
              </div>
            </form>
          </div>
          <div id="onboarding-result" class="result" aria-live="polite">
            <p class="empty">No invitation created or accepted in this browser session.</p>
          </div>
          <div id="invitation-list" class="mini-list">${invitationRows(onboarding.invitations)}</div>
        </div>
      </section>

      <div class="layout-2">
        <section class="panel" id="analysis">
          <div class="panel-head">
            <h2>Run Analysis</h2>
            <span class="section-kicker">Hosted API</span>
          </div>
          <div class="panel-body">
            <form id="analysis-form" class="form-grid">
              <div class="field wide">
                <label for="api-token">API token</label>
                <input id="api-token" type="password" autocomplete="off" placeholder="Bearer token">
              </div>
              <div class="field">
                <label for="tenant">Tenant</label>
                <select id="tenant">${renderOptions(tenantSlugs)}</select>
              </div>
              <div class="field">
                <label for="symbol">Symbol</label>
                <input id="symbol" value="NVDA" autocomplete="off">
              </div>
              <div class="field">
                <label for="horizon">Horizon</label>
                <select id="horizon">
                  <option value="swing">swing</option>
                  <option value="intraday">intraday</option>
                  <option value="position">position</option>
                </select>
              </div>
              <div class="field">
                <label for="ceiling">Action ceiling</label>
                <select id="ceiling">
                  <option value="watchlist">watchlist</option>
                  <option value="research_needed">research_needed</option>
                  <option value="paper_trade_candidate">paper_trade_candidate</option>
                </select>
              </div>
              <div class="field wide">
                <label for="thesis">Thesis</label>
                <textarea id="thesis">post-earnings continuation with controlled risk</textarea>
              </div>
              <div class="field wide">
                <label for="data-dir">Data dir</label>
                <input id="data-dir" placeholder="tenant-scoped data directory or blank">
                <span class="field-note">Explicit paths outside the tenant workspace are rejected by the API.</span>
              </div>
              <div class="field wide">
                <div class="form-actions">
                  <button type="button" id="save-token">Save token locally</button>
                  <button type="button" id="refresh-library">Refresh tenant</button>
                  <button type="submit" class="primary">Run analysis</button>
                </div>
              </div>
            </form>
            <div id="analysis-result" class="result" aria-live="polite">
              <p class="empty">No hosted analysis submitted in this browser session.</p>
            </div>
          </div>
        </section>
      </div>

      <div class="layout-2">
        <section class="panel">
          <div class="panel-head">
            <h2>Boundary Status</h2>
            <span class="section-kicker">Secrets and networks</span>
          </div>
          <table>
            <thead><tr><th>Boundary</th><th>Status</th><th>Records</th><th>Safety</th></tr></thead>
            <tbody>${boundaryRows(boundary)}</tbody>
          </table>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Recent Boundary Runs</h2>
            <span class="section-kicker">Replay evidence</span>
          </div>
          <div class="panel-body mini-list" id="recent-runs">${miniRows(recentRuns)}</div>
        </section>
      </div>

      <section class="panel" id="tenants">
        <div class="panel-head">
          <h2>Tenants</h2>
          <span class="section-kicker">${escapeHtml(persistence.status)}</span>
        </div>
        <table>
          <thead><tr><th>Tenant</th><th>Status</th><th>Dossiers</th><th>Events</th><th>State Keys</th><th>Latest Event</th><th>Audit Dir</th></tr></thead>
          <tbody>${tenantRows(persistence.tenants)}</tbody>
        </table>
      </section>

      <div class="layout-2">
        <section class="panel">
          <div class="panel-head">
            <h2>Tenant Library</h2>
            <span class="section-kicker" id="library-label">${escapeHtml(tenantSlugs[0] ?? "tenant")}</span>
          </div>
          <div class="panel-body">
            <div id="library-result" class="mini-list">
              <p class="empty inline-empty">Connect with a token to read the tenant library.</p>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <h2>Tenant Events</h2>
            <span class="section-kicker" id="events-label">${escapeHtml(tenantSlugs[0] ?? "tenant")}</span>
          </div>
          <div class="panel-body">
            <div id="events-result" class="mini-list">
              <p class="empty inline-empty">Connect with a token to read tenant events.</p>
            </div>
          </div>
        </section>
      </div>

      <section class="panel" id="providers">
        <div class="panel-head">
          <h2>Provider Contracts</h2>
          <span class="section-kicker">${escapeHtml(generatedAt)}</span>
        </div>
        <table>
          <thead><tr><th>Manifest</th><th>Provider</th><th>Contract</th><th>Manifest Status</th><th>Validation</th><th>Secret Ref</th><th>Failures</th></tr></thead>
          <tbody>${providerRows(providerValidation.providers)}</tbody>
        </table>
      </section>

      <section class="panel">
        <div class="panel-head">
          <h2>Control Plane</h2>
          <span class="section-kicker">${escapeHtml(saas.environment)}</span>
        </div>
        <table>
          <tbody>
            ${row("Control plane", saas.control_plane_id)}
            ${row("Cross-tenant queries", saas.tenancy.cross_tenant_queries_allowed ? "allowed" : "disabled")}
            ${row("Direct broker connection", saas.production_boundaries.direct_broker_connection ? "allowed" : "blocked")}
            ${row("Partner adapter default", saas.production_boundaries.production_partner_adapter_default)}
            ${row("Observability events", readiness.summary.observability_event_count)}
          </tbody>
        </table>
      </section>

      <section class="panel" id="controls">
        <div class="panel-head">
          <h2>Readiness Controls</h2>
          <span class="section-kicker">Required and warning gates</span>
        </div>
        <table>
          <thead><tr><th>Control</th><th>Status</th><th>Severity</th><th>Detail</th></tr></thead>
          <tbody>${controlRows([
            ...providerValidation.controls,
            ...readiness.controls,
            ...identity.controls,
            ...storage.controls,
            ...onboarding.controls,
            ...dataVendor.controls,
            ...llmProvider.controls
          ])}</tbody>
        </table>
      </section>
    </main>
  </div>
  <script id="console-state" type="application/json">${escapeJson(consoleState)}</script>
  <script>
    const consoleState = JSON.parse(document.getElementById("console-state").textContent);
    const tokenInput = document.getElementById("api-token");
    const tenantInput = document.getElementById("tenant");
    const resultEl = document.getElementById("analysis-result");
    const libraryEl = document.getElementById("library-result");
    const eventsEl = document.getElementById("events-result");
    const repairEl = document.getElementById("repair-list");
    const repairResultEl = document.getElementById("repair-result");
    const onboardingResultEl = document.getElementById("onboarding-result");
    const invitationListEl = document.getElementById("invitation-list");
    tokenInput.value = sessionStorage.getItem("parallax_console_token") || "";

    function escapeText(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function statusClass(value) {
      const text = String(value ?? "").toLowerCase();
      if (text.includes("ready_for") || text === "accepted" || text === "passed" || text === "active") return "good";
      if (text.includes("blocked") || text === "expired" || text === "revoked" || text === "failed") return "bad";
      if (text.includes("warning") || text === "pending" || text.includes("disabled")) return "warn";
      return "neutral";
    }

    function badgeHtml(value) {
      return '<span class="badge ' + statusClass(value) + '">' + escapeText(value) + '</span>';
    }

    function authHeaders(tenant) {
      const headers = {
        "authorization": "Bearer " + tokenInput.value.trim(),
        "content-type": "application/json"
      };
      if (tenant) headers["x-parallax-tenant"] = tenant;
      return headers;
    }

    async function apiFetch(url, options = {}, tenant = "") {
      if (!tokenInput.value.trim()) throw new Error("API token is required.");
      const response = await fetch(url, {
        ...options,
        headers: {
          ...authHeaders(tenant),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(body.message || body.error || "Request failed");
      }
      return body;
    }

    async function publicJsonFetch(url, options = {}) {
      const response = await fetch(url, {
        ...options,
        headers: {
          "content-type": "application/json",
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new Error(body.message || body.error || "Request failed");
      }
      return body;
    }

    function renderMini(target, rows, emptyText) {
      if (!rows.length) {
        target.innerHTML = '<p class="empty inline-empty">' + escapeText(emptyText) + '</p>';
        return;
      }
      target.innerHTML = rows.map((item) => (
        '<div class="mini-row">' +
          '<div><strong>' + escapeText(item.title) + '</strong><span>' + escapeText(item.detail) + '</span></div>' +
          badgeHtml(item.status) +
        '</div>'
      )).join("");
    }

    function renderRepairPlan(plan) {
      repairEl.innerHTML = (plan.actions || []).map((item) => (
        '<div class="repair-row ' + statusClass(item.status) + '">' +
          '<div><strong>' + escapeText(item.label) + '</strong><span>' + escapeText(item.detail) + '</span><code>' + escapeText(item.command) + '</code></div>' +
          '<div class="repair-state">' + badgeHtml(item.status) + (item.block_reason ? '<span>' + escapeText(item.block_reason) + '</span>' : '') + '</div>' +
        '</div>'
      )).join("");
      repairResultEl.innerHTML =
        '<div class="result-line"><strong>Repair status</strong>' + badgeHtml(plan.status) + '</div>' +
        '<div class="result-line"><strong>Complete</strong><span>' + escapeText(plan.summary.complete_count + " / " + plan.summary.action_count) + '</span></div>' +
        '<div class="result-line"><strong>Next</strong><span>' + escapeText(plan.next_action?.label || "No repair needed") + '</span></div>';
    }

    function renderInvitations(status) {
      const invitations = status.invitations || [];
      if (!invitations.length) {
        invitationListEl.innerHTML = '<p class="empty inline-empty">No workspace invitations yet.</p>';
        return;
      }
      invitationListEl.innerHTML = invitations.slice(-8).reverse().map((item) => (
        '<div class="mini-row">' +
          '<div><strong>' + escapeText(item.email) + '</strong><span>' + escapeText(item.tenant_slug + " | " + item.role + " | expires " + item.expires_at) + '</span></div>' +
          badgeHtml(item.status) +
        '</div>'
      )).join("");
    }

    async function refreshOnboarding() {
      const status = await apiFetch("/api/onboarding/status", { method: "GET" });
      renderInvitations(status);
      onboardingResultEl.innerHTML =
        '<div class="result-line"><strong>Onboarding status</strong>' + badgeHtml(status.status) + '</div>' +
        '<div class="result-line"><strong>Pending</strong><span>' + escapeText(status.summary.pending_count) + '</span></div>' +
        '<div class="result-line"><strong>Accepted</strong><span>' + escapeText(status.summary.accepted_count) + '</span></div>' +
        '<div class="result-line"><strong>Raw invite token stored</strong><span>' + escapeText(status.summary.raw_invite_token_stored ? "yes" : "no") + '</span></div>';
      return status;
    }

    async function refreshRepairPlan() {
      const params = new URLSearchParams({
        tenant: tenantInput.value || "alpha",
        symbol: document.getElementById("symbol").value.trim() || "NVDA"
      });
      const plan = await apiFetch("/api/setup-repair?" + params.toString(), { method: "GET" });
      renderRepairPlan(plan);
      return plan;
    }

    async function refreshTenant() {
      const tenant = tenantInput.value;
      document.getElementById("library-label").textContent = tenant;
      document.getElementById("events-label").textContent = tenant;
      const [library, events] = await Promise.all([
        apiFetch("/api/tenants/" + encodeURIComponent(tenant) + "/library", { method: "GET" }, tenant),
        apiFetch("/api/tenants/" + encodeURIComponent(tenant) + "/events", { method: "GET" }, tenant)
      ]);
      renderMini(libraryEl, (library.entries || []).slice(0, 8).map((entry) => ({
        title: entry.symbol + " | " + entry.action_class,
        detail: entry.thesis,
        status: entry.thesis_state
      })), "No dossiers in this tenant library.");
      renderMini(eventsEl, (events.events || events || []).slice(-8).reverse().map((event) => ({
        title: event.event_type,
        detail: event.created_at,
        status: event.payload?.action_class || "logged"
      })), "No tenant events recorded.");
    }

    document.getElementById("save-token").addEventListener("click", () => {
      sessionStorage.setItem("parallax_console_token", tokenInput.value.trim());
      resultEl.innerHTML = '<p class="empty">Token saved in this browser session.</p>';
    });

    document.getElementById("refresh-library").addEventListener("click", async () => {
      try {
        await refreshTenant();
      } catch (error) {
        libraryEl.innerHTML = '<p class="empty inline-empty">' + escapeText(error.message) + '</p>';
        eventsEl.innerHTML = '<p class="empty inline-empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("preview-repair").addEventListener("click", async () => {
      try {
        await refreshRepairPlan();
      } catch (error) {
        repairResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("apply-next-repair").addEventListener("click", async () => {
      const tenant = tenantInput.value || "alpha";
      const symbol = document.getElementById("symbol").value.trim() || "NVDA";
      repairResultEl.innerHTML = '<p class="empty">Applying next guided repair...</p>';
      try {
        const result = await apiFetch("/api/setup-repair", {
          method: "POST",
          body: JSON.stringify({
            action_id: "next",
            tenant_slug: tenant,
            symbol
          })
        });
        renderRepairPlan(result.repair_status);
      } catch (error) {
        repairResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("refresh-onboarding").addEventListener("click", async () => {
      try {
        await refreshOnboarding();
      } catch (error) {
        onboardingResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("invite-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      onboardingResultEl.innerHTML = '<p class="empty">Creating workspace invitation...</p>';
      try {
        const response = await apiFetch("/api/onboarding/invitations", {
          method: "POST",
          body: JSON.stringify({
            email: document.getElementById("invite-email").value.trim(),
            name: document.getElementById("invite-name").value.trim(),
            tenant_slug: document.getElementById("invite-tenant").value,
            role: document.getElementById("invite-role").value,
            ttl_minutes: Number(document.getElementById("invite-ttl").value || 10080)
          })
        });
        onboardingResultEl.innerHTML =
          '<div class="result-line"><strong>Invitation</strong><code>' + escapeText(response.invitation.id) + '</code></div>' +
          '<div class="result-line"><strong>Status</strong>' + badgeHtml(response.invitation.status) + '</div>' +
          '<div class="result-line"><strong>Invite token</strong><code>' + escapeText(response.invite_token) + '</code></div>' +
          '<div class="result-line"><strong>Raw token stored</strong><span>' + escapeText(response.raw_invite_token_stored ? "yes" : "no") + '</span></div>';
        const status = await apiFetch("/api/onboarding/status", { method: "GET" });
        renderInvitations(status);
      } catch (error) {
        onboardingResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("accept-invite-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      onboardingResultEl.innerHTML = '<p class="empty">Accepting workspace invitation...</p>';
      try {
        const response = await publicJsonFetch("/api/onboarding/accept", {
          method: "POST",
          body: JSON.stringify({
            invite_token: document.getElementById("invite-token").value.trim(),
            email: document.getElementById("accept-email").value.trim() || undefined,
            name: document.getElementById("accept-name").value.trim() || undefined
          })
        });
        tokenInput.value = response.session_token;
        sessionStorage.setItem("parallax_console_token", response.session_token);
        onboardingResultEl.innerHTML =
          '<div class="result-line"><strong>Invitation</strong>' + badgeHtml(response.invitation.status) + '</div>' +
          '<div class="result-line"><strong>Principal</strong><span>' + escapeText(response.principal.email) + '</span></div>' +
          '<div class="result-line"><strong>Session token</strong><code>' + escapeText(response.session_token) + '</code></div>' +
          '<div class="result-line"><strong>Raw session token stored</strong><span>' + escapeText(response.raw_session_token_stored ? "yes" : "no") + '</span></div>';
        renderInvitations({ invitations: [response.invitation] });
      } catch (error) {
        onboardingResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("analysis-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const tenant = tenantInput.value;
      const payload = {
        symbol: document.getElementById("symbol").value.trim(),
        horizon: document.getElementById("horizon").value,
        thesis: document.getElementById("thesis").value.trim(),
        ceiling: document.getElementById("ceiling").value
      };
      const dataDir = document.getElementById("data-dir").value.trim();
      if (dataDir) payload.data_dir = dataDir;
      resultEl.innerHTML = '<p class="empty">Submitting analysis...</p>';
      try {
        const response = await apiFetch("/api/tenants/" + encodeURIComponent(tenant) + "/analyze", {
          method: "POST",
          body: JSON.stringify(payload)
        }, tenant);
        resultEl.innerHTML =
          '<div class="result-line"><strong>Dossier</strong><code>' + escapeText(response.dossier_id) + '</code></div>' +
          '<div class="result-line"><strong>Action class</strong>' + badgeHtml(response.action_class) + '</div>' +
          '<div class="result-line"><strong>Lifecycle</strong>' + badgeHtml(response.thesis_state) + '</div>' +
          '<div class="result-line"><strong>Audit</strong><code>' + escapeText(response.audit_path) + '</code></div>';
        await refreshTenant();
      } catch (error) {
        resultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });
  </script>
</body>
</html>`;
  return html.replace(/[ \t]+$/gm, "");
}

function publicConsoleStyles() {
  return `
    :root {
      color-scheme: light;
      --bg: oklch(0.972 0.009 205);
      --shell: oklch(0.947 0.012 205);
      --surface: oklch(0.991 0.005 205);
      --surface-2: oklch(0.963 0.008 205);
      --text: oklch(0.228 0.018 224);
      --muted: oklch(0.48 0.021 224);
      --line: oklch(0.848 0.018 205);
      --accent: oklch(0.48 0.124 187);
      --good: oklch(0.43 0.101 154);
      --good-bg: oklch(0.938 0.043 154);
      --warn: oklch(0.56 0.119 78);
      --warn-bg: oklch(0.956 0.046 78);
      --bad: oklch(0.54 0.154 31);
      --bad-bg: oklch(0.952 0.039 31);
      --shadow: 0 18px 42px oklch(0.35 0.035 225 / 0.08);
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
      color: var(--text);
      background: var(--bg);
      font-size: 15px;
      line-height: 1.45;
    }
    a { color: inherit; }
    .shell {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 236px minmax(0, 1fr);
    }
    aside {
      background: var(--shell);
      border-right: 1px solid var(--line);
      padding: 22px 18px;
    }
    .brand strong { display: block; font-size: 1.08rem; line-height: 1.15; }
    .brand span, .muted, label, .note, td span { color: var(--muted); }
    nav { display: grid; gap: 6px; margin-top: 24px; }
    nav a {
      min-height: 36px;
      display: flex;
      align-items: center;
      border-radius: 7px;
      padding: 7px 9px;
      color: var(--muted);
      text-decoration: none;
      font-weight: 700;
      font-size: 0.9rem;
    }
    nav a:hover, nav a:focus-visible {
      color: var(--text);
      background: var(--surface);
      outline: none;
      box-shadow: inset 0 0 0 1px var(--line);
    }
    main {
      min-width: 0;
      padding: 26px 30px 42px;
      display: grid;
      gap: 20px;
      align-content: start;
    }
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 16px;
      align-items: start;
    }
    h1, h2, p { margin: 0; letter-spacing: 0; }
    h1 { font-size: 1.52rem; line-height: 1.14; }
    h2 { font-size: 1rem; }
    .section-kicker, label {
      color: var(--muted);
      font-size: 0.76rem;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .layout-2 {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(320px, 0.86fr);
      gap: 20px;
      align-items: start;
    }
    .panel {
      background: var(--surface);
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      box-shadow: var(--shadow);
    }
    .panel-head {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      align-items: center;
      padding: 13px 15px;
      background: var(--surface-2);
      border-bottom: 1px solid var(--line);
    }
    .panel-body { padding: 15px; }
    .form-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .field { display: grid; gap: 6px; }
    .field.wide { grid-column: 1 / -1; }
    input, textarea, select {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 7px;
      background: var(--surface);
      color: var(--text);
      padding: 9px 10px;
      font: inherit;
    }
    textarea { min-height: 104px; resize: vertical; }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      align-items: center;
      gap: 8px;
      margin-top: 12px;
    }
    button, .button {
      min-height: 34px;
      border-radius: 7px;
      border: 1px solid var(--line);
      background: var(--surface);
      color: var(--text);
      padding: 7px 11px;
      font: inherit;
      font-weight: 750;
      cursor: pointer;
      text-decoration: none;
    }
    button.primary, .button.primary {
      border-color: oklch(0.63 0.09 187);
      background: var(--accent);
      color: oklch(0.985 0.008 187);
    }
    button:hover, .button:hover { background: var(--surface-2); }
    button.primary:hover, .button.primary:hover { background: oklch(0.43 0.13 187); }
    button:focus-visible, input:focus-visible, textarea:focus-visible, select:focus-visible, a:focus-visible {
      outline: 2px solid oklch(0.57 0.14 187);
      outline-offset: 2px;
    }
    .result, .list { display: grid; gap: 9px; }
    .result-line, .item {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px 11px;
      background: oklch(0.985 0.004 205);
      overflow-wrap: anywhere;
    }
    .result-line strong, .item strong { display: block; }
    .result-line span, .item span { color: var(--muted); font-size: 0.84rem; }
    .badge {
      display: inline-flex;
      min-height: 24px;
      align-items: center;
      padding: 3px 8px;
      border-radius: 999px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: oklch(0.97 0.006 205);
      font-size: 0.76rem;
      font-weight: 800;
      white-space: nowrap;
    }
    .badge.good { color: var(--good); background: var(--good-bg); border-color: oklch(0.82 0.052 154); }
    .badge.warn { color: var(--warn); background: var(--warn-bg); border-color: oklch(0.84 0.06 78); }
    .badge.bad { color: var(--bad); background: var(--bad-bg); border-color: oklch(0.82 0.065 31); }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
      color: oklch(0.34 0.05 225);
      overflow-wrap: anywhere;
    }
    .empty { color: var(--muted); }
    @media (max-width: 980px) {
      .shell { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      nav { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      header, .layout-2 { grid-template-columns: 1fr; }
    }
    @media (max-width: 680px) {
      main { padding: 18px 14px 28px; }
      nav, .form-grid, .result-line, .item { grid-template-columns: 1fr; }
      .actions { justify-content: stretch; }
      .actions button, .actions .button { width: 100%; text-align: center; }
    }
  `;
}

export function buildPublicJoinHtml({ now = new Date().toISOString() }: { now?: string } = {}) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parallax Join Workspace</title>
  <style>${publicConsoleStyles()}</style>
</head>
<body>
  <div class="shell">
    <aside>
      <div class="brand">
        <strong>Parallax</strong>
        <span>Workspace access</span>
      </div>
      <nav aria-label="Primary">
        <a href="#join">Join</a>
        <a href="/tenant-console">Tenant Console</a>
      </nav>
    </aside>
    <main>
      <header id="join">
        <div>
          <p class="section-kicker">Workspace Invitation</p>
          <h1>Join workspace</h1>
        </div>
        <span class="badge warn">invite required</span>
      </header>
      <section class="panel">
        <div class="panel-head">
          <h2>Invitation</h2>
          <span class="section-kicker">Hash-only</span>
        </div>
        <div class="panel-body">
          <form id="join-form" class="form-grid">
            <div class="field wide">
              <label for="invite-token">Invite token</label>
              <input id="invite-token" autocomplete="off" placeholder="pinv_...">
            </div>
            <div class="field">
              <label for="email">Email</label>
              <input id="email" type="email" autocomplete="email">
            </div>
            <div class="field">
              <label for="name">Name</label>
              <input id="name" autocomplete="name">
            </div>
            <div class="field wide">
              <div class="actions">
                <button type="submit" class="primary">Accept invitation</button>
              </div>
            </div>
          </form>
          <div id="join-result" class="result" aria-live="polite">
            <p class="empty">No invitation accepted in this browser session.</p>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script>
    const tokenInput = document.getElementById("invite-token");
    const params = new URLSearchParams(window.location.search);
    tokenInput.value = params.get("token") || "";
    const resultEl = document.getElementById("join-result");

    function escapeText(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function badge(value, state = "neutral") {
      return '<span class="badge ' + state + '">' + escapeText(value) + '</span>';
    }

    document.getElementById("join-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      resultEl.innerHTML = '<p class="empty">Accepting invitation...</p>';
      try {
        const response = await fetch("/api/onboarding/accept", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            invite_token: tokenInput.value.trim(),
            email: document.getElementById("email").value.trim() || undefined,
            name: document.getElementById("name").value.trim() || undefined
          })
        });
        const text = await response.text();
        const body = text ? JSON.parse(text) : {};
        if (!response.ok) throw new Error(body.message || body.error || "Request failed");
        sessionStorage.setItem("parallax_console_token", body.session_token);
        const tenant = body.session?.tenant_slug || body.invitation?.tenant_slug || "";
        if (tenant) sessionStorage.setItem("parallax_tenant", tenant);
        resultEl.innerHTML =
          '<div class="result-line"><strong>Invitation</strong>' + badge(body.invitation.status, "good") + '</div>' +
          '<div class="result-line"><strong>Principal</strong><span>' + escapeText(body.principal.email) + '</span></div>' +
          '<div class="result-line"><strong>Session token</strong><code>' + escapeText(body.session_token) + '</code></div>' +
          '<div class="result-line"><strong>Workspace</strong><a class="button primary" href="/tenant-console?tenant=' + encodeURIComponent(tenant) + '">Open tenant console</a></div>';
      } catch (error) {
        resultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });
  </script>
  <script id="join-state" type="application/json">${escapeJson({ generatedAt: now, raw_token_stored: false })}</script>
</body>
</html>`;
  return html.replace(/[ \t]+$/gm, "");
}

export function buildTenantConsoleHtml({ now = new Date().toISOString() }: { now?: string } = {}) {
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parallax Tenant Console</title>
  <style>${publicConsoleStyles()}</style>
</head>
<body>
  <div class="shell">
    <aside>
      <div class="brand">
        <strong>Parallax</strong>
        <span>Tenant Console</span>
      </div>
      <nav aria-label="Primary">
        <a href="#account">Account</a>
        <a href="#workspace">Workspace</a>
        <a href="#analysis">Analysis</a>
      </nav>
    </aside>
    <main>
      <header>
        <div>
          <p class="section-kicker">Tenant Workspace</p>
          <h1>Research console</h1>
        </div>
        <button type="button" id="refresh-account">Refresh</button>
      </header>

      <section class="panel" id="account">
        <div class="panel-head">
          <h2>Account</h2>
          <span class="section-kicker">Identity session</span>
        </div>
        <div class="panel-body">
          <form id="account-form" class="form-grid">
            <div class="field wide">
              <label for="session-token">Session token</label>
              <input id="session-token" type="password" autocomplete="off" placeholder="psess_...">
            </div>
            <div class="field">
              <label for="tenant">Tenant</label>
              <select id="tenant"></select>
            </div>
            <div class="field">
              <label for="profile-name">Name</label>
              <input id="profile-name" autocomplete="name">
            </div>
            <div class="field wide">
              <div class="actions">
                <button type="submit">Save account</button>
              </div>
            </div>
          </form>
          <div id="account-result" class="result" aria-live="polite">
            <p class="empty">No account loaded in this browser session.</p>
          </div>
        </div>
      </section>

      <div class="layout-2" id="workspace">
        <section class="panel">
          <div class="panel-head">
            <h2>Library</h2>
            <span class="section-kicker" id="library-label">tenant</span>
          </div>
          <div class="panel-body">
            <div id="library-result" class="list">
              <p class="empty">No tenant library loaded.</p>
            </div>
          </div>
        </section>
        <section class="panel">
          <div class="panel-head">
            <h2>Events</h2>
            <span class="section-kicker" id="events-label">tenant</span>
          </div>
          <div class="panel-body">
            <div id="events-result" class="list">
              <p class="empty">No tenant events loaded.</p>
            </div>
          </div>
        </section>
      </div>

      <section class="panel" id="analysis">
        <div class="panel-head">
          <h2>Analysis</h2>
          <span class="section-kicker">Tenant scoped</span>
        </div>
        <div class="panel-body">
          <form id="analysis-form" class="form-grid">
            <div class="field">
              <label for="symbol">Symbol</label>
              <input id="symbol" value="NVDA" autocomplete="off">
            </div>
            <div class="field">
              <label for="horizon">Horizon</label>
              <select id="horizon">
                <option value="swing">swing</option>
                <option value="intraday">intraday</option>
                <option value="position">position</option>
              </select>
            </div>
            <div class="field wide">
              <label for="thesis">Thesis</label>
              <textarea id="thesis">post-earnings continuation with controlled risk</textarea>
            </div>
            <div class="field wide">
              <div class="actions">
                <button type="button" id="refresh-workspace">Refresh workspace</button>
                <button type="submit" class="primary">Run analysis</button>
              </div>
            </div>
          </form>
          <div id="analysis-result" class="result" aria-live="polite">
            <p class="empty">No tenant analysis submitted in this browser session.</p>
          </div>
        </div>
      </section>
    </main>
  </div>
  <script>
    const tokenInput = document.getElementById("session-token");
    const tenantInput = document.getElementById("tenant");
    const accountResultEl = document.getElementById("account-result");
    const libraryEl = document.getElementById("library-result");
    const eventsEl = document.getElementById("events-result");
    const analysisEl = document.getElementById("analysis-result");
    const params = new URLSearchParams(window.location.search);
    tokenInput.value = sessionStorage.getItem("parallax_console_token") || "";
    const initialTenant = params.get("tenant") || sessionStorage.getItem("parallax_tenant") || "";

    function escapeText(value) {
      return String(value ?? "").replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[char]));
    }

    function statusClass(value) {
      const text = String(value ?? "").toLowerCase();
      if (text.includes("ready") || text === "active" || text === "accepted") return "good";
      if (text.includes("blocked") || text === "failed" || text === "revoked") return "bad";
      if (text.includes("pending") || text.includes("warning")) return "warn";
      return "neutral";
    }

    function badge(value) {
      return '<span class="badge ' + statusClass(value) + '">' + escapeText(value) + '</span>';
    }

    function authHeaders(tenant) {
      const headers = {
        "authorization": "Bearer " + tokenInput.value.trim(),
        "content-type": "application/json"
      };
      if (tenant) headers["x-parallax-tenant"] = tenant;
      return headers;
    }

    async function apiFetch(url, options = {}, tenant = "") {
      if (!tokenInput.value.trim()) throw new Error("Session token is required.");
      const response = await fetch(url, {
        ...options,
        headers: {
          ...authHeaders(tenant),
          ...(options.headers || {})
        }
      });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      if (!response.ok) throw new Error(body.message || body.error || "Request failed");
      return body;
    }

    function renderList(target, rows, emptyText) {
      if (!rows.length) {
        target.innerHTML = '<p class="empty">' + escapeText(emptyText) + '</p>';
        return;
      }
      target.innerHTML = rows.map((item) => (
        '<div class="item">' +
          '<div><strong>' + escapeText(item.title) + '</strong><span>' + escapeText(item.detail) + '</span></div>' +
          badge(item.status) +
        '</div>'
      )).join("");
    }

    function syncTenantOptions(profile) {
      const memberships = profile.profile?.memberships || [];
      tenantInput.innerHTML = memberships.map((membership) =>
        '<option value="' + escapeText(membership.tenant_slug) + '">' + escapeText(membership.tenant_slug + " | " + membership.role) + '</option>'
      ).join("");
      const preferred = initialTenant || profile.session?.tenant_slug || memberships[0]?.tenant_slug || "";
      if (preferred) tenantInput.value = preferred;
      document.getElementById("profile-name").value = profile.profile?.name || "";
    }

    async function refreshAccount() {
      const profile = await apiFetch("/api/account/me", { method: "GET" });
      syncTenantOptions(profile);
      sessionStorage.setItem("parallax_console_token", tokenInput.value.trim());
      if (tenantInput.value) sessionStorage.setItem("parallax_tenant", tenantInput.value);
      accountResultEl.innerHTML =
        '<div class="result-line"><strong>Account</strong><span>' + escapeText(profile.profile.email) + '</span></div>' +
        '<div class="result-line"><strong>Name</strong><span>' + escapeText(profile.profile.name) + '</span></div>' +
        '<div class="result-line"><strong>Active role</strong>' + badge(profile.session.role) + '</div>' +
        '<div class="result-line"><strong>Raw session token stored</strong><span>' + escapeText(profile.raw_session_token_stored ? "yes" : "no") + '</span></div>';
      return profile;
    }

    async function refreshWorkspace() {
      const tenant = tenantInput.value;
      document.getElementById("library-label").textContent = tenant || "tenant";
      document.getElementById("events-label").textContent = tenant || "tenant";
      const [library, events] = await Promise.all([
        apiFetch("/api/tenants/" + encodeURIComponent(tenant) + "/library", { method: "GET" }, tenant),
        apiFetch("/api/tenants/" + encodeURIComponent(tenant) + "/events", { method: "GET" }, tenant)
      ]);
      renderList(libraryEl, (library.entries || []).slice(0, 8).map((entry) => ({
        title: entry.symbol + " | " + entry.action_class,
        detail: entry.thesis,
        status: entry.thesis_state
      })), "No dossiers in this tenant library.");
      renderList(eventsEl, (events.events || events || []).slice(-8).reverse().map((event) => ({
        title: event.event_type,
        detail: event.created_at,
        status: event.payload?.action_class || "logged"
      })), "No tenant events recorded.");
    }

    document.getElementById("refresh-account").addEventListener("click", async () => {
      try {
        await refreshAccount();
        await refreshWorkspace();
      } catch (error) {
        accountResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("refresh-workspace").addEventListener("click", async () => {
      try {
        await refreshWorkspace();
      } catch (error) {
        libraryEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
        eventsEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("account-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      try {
        const profile = await apiFetch("/api/account/profile", {
          method: "POST",
          body: JSON.stringify({
            name: document.getElementById("profile-name").value.trim(),
            default_tenant_slug: tenantInput.value
          })
        });
        syncTenantOptions(profile);
        accountResultEl.innerHTML =
          '<div class="result-line"><strong>Account</strong><span>' + escapeText(profile.profile.email) + '</span></div>' +
          '<div class="result-line"><strong>Name</strong><span>' + escapeText(profile.profile.name) + '</span></div>' +
          '<div class="result-line"><strong>Status</strong>' + badge(profile.status) + '</div>';
      } catch (error) {
        accountResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    document.getElementById("analysis-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const tenant = tenantInput.value;
      analysisEl.innerHTML = '<p class="empty">Submitting analysis...</p>';
      try {
        const response = await apiFetch("/api/tenants/" + encodeURIComponent(tenant) + "/analyze", {
          method: "POST",
          body: JSON.stringify({
            symbol: document.getElementById("symbol").value.trim(),
            horizon: document.getElementById("horizon").value,
            thesis: document.getElementById("thesis").value.trim(),
            ceiling: "watchlist"
          })
        }, tenant);
        analysisEl.innerHTML =
          '<div class="result-line"><strong>Dossier</strong><code>' + escapeText(response.dossier_id) + '</code></div>' +
          '<div class="result-line"><strong>Action class</strong>' + badge(response.action_class) + '</div>' +
          '<div class="result-line"><strong>Audit</strong><code>' + escapeText(response.audit_path) + '</code></div>';
        await refreshWorkspace();
      } catch (error) {
        analysisEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      }
    });

    if (tokenInput.value) {
      refreshAccount().then(refreshWorkspace).catch((error) => {
        accountResultEl.innerHTML = '<p class="empty">' + escapeText(error.message) + '</p>';
      });
    }
  </script>
  <script id="tenant-console-state" type="application/json">${escapeJson({ generatedAt: now, raw_token_stored: false })}</script>
</body>
</html>`;
  return html.replace(/[ \t]+$/gm, "");
}

export async function writeHostedConsole({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  validationPath = providerValidationPath(rootDir),
  out = path.join(rootDir, "parallax-hosted-console.html"),
  apiTokenHash = "",
  now
}: {
  rootDir?: string;
  configPath?: string;
  validationPath?: string;
  out?: string;
  apiTokenHash?: string;
  now?: string;
} = {}) {
  const html = await buildHostedConsoleHtml({ rootDir, configPath, validationPath, apiTokenHash, now });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  return {
    out,
    root_dir: rootDir,
    validation_path: validationPath,
    bytes: Buffer.byteLength(html),
    console_kind: "hosted_research_console",
    generated_at: now ?? new Date().toISOString()
  };
}
