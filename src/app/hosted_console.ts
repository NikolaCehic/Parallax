import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { managedSaasConfigPath, managedSaasStatus } from "../saas/managed.js";
import { providerValidationPath, validateProviderContracts } from "../providers/validation.js";

function escapeHtml(value: any) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function stateClass(value: string) {
  if (["blocked", "failed", "enabled_production", "missing"].includes(value)) return "bad";
  if (["warning", "not_validated", "disabled_until_configured", "disabled_until_legal_approval"].includes(value)) return "warn";
  if (["ready_for_provider_contract_beta", "ready_for_managed_beta_scaffold", "contract_validated", "passed", "active"].includes(value)) return "good";
  return "neutral";
}

function badge(value: any) {
  return `<span class="badge ${stateClass(String(value))}">${escapeHtml(value)}</span>`;
}

function row(label: string, value: any) {
  return `<tr><th>${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`;
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
    return `<tr><td colspan="6" class="empty">No tenants configured.</td></tr>`;
  }
  return tenants.map((tenant: any) => `
    <tr>
      <td><strong>${escapeHtml(tenant.name)}</strong><span>${escapeHtml(tenant.slug)}</span></td>
      <td>${badge(tenant.status)}</td>
      <td>${escapeHtml(tenant.plan)}</td>
      <td>${escapeHtml(tenant.region)}</td>
      <td>${escapeHtml(tenant.data_residency)}</td>
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

export async function buildHostedConsoleHtml({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  validationPath = providerValidationPath(rootDir),
  now
}: {
  rootDir?: string;
  configPath?: string;
  validationPath?: string;
  now?: string;
} = {}) {
  const providerValidation = await validateProviderContracts({
    rootDir,
    configPath,
    out: validationPath,
    now
  });
  const saas = await managedSaasStatus({ rootDir, configPath, now });
  const readiness = saas.readiness;
  const generatedAt = now ?? providerValidation.generated_at;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Parallax Hosted Console</title>
  <style>
    :root {
      color-scheme: light;
      --bg: oklch(0.975 0.007 205);
      --surface: oklch(0.995 0.004 205);
      --band: oklch(0.941 0.011 205);
      --text: oklch(0.235 0.019 225);
      --muted: oklch(0.48 0.022 225);
      --line: oklch(0.858 0.018 205);
      --accent: oklch(0.49 0.13 191);
      --good: oklch(0.47 0.105 154);
      --warn: oklch(0.61 0.123 78);
      --bad: oklch(0.55 0.16 31);
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
    header {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 24px;
      align-items: end;
      padding: 28px 32px 18px;
      border-bottom: 1px solid var(--line);
      background: var(--surface);
    }
    h1, h2 { margin: 0; letter-spacing: 0; }
    h1 { font-size: 1.6rem; line-height: 1.15; }
    h2 { font-size: 1rem; }
    .subtle { color: var(--muted); margin-top: 6px; max-width: 72ch; }
    main { display: grid; gap: 22px; padding: 22px 32px 40px; }
    .statusbar {
      display: grid;
      grid-template-columns: repeat(5, minmax(150px, 1fr));
      gap: 1px;
      overflow: hidden;
      border: 1px solid var(--line);
      background: var(--line);
      border-radius: 8px;
      box-shadow: var(--shadow);
    }
    .statusbar section {
      background: var(--surface);
      min-height: 84px;
      padding: 14px 16px;
    }
    .statusbar span, th, .table-title span, .control-note {
      color: var(--muted);
      font-size: 0.78rem;
      font-weight: 650;
      text-transform: uppercase;
      letter-spacing: 0;
    }
    .statusbar strong {
      display: block;
      margin-top: 10px;
      font-size: 1.02rem;
      overflow-wrap: anywhere;
    }
    .grid {
      display: grid;
      grid-template-columns: 1.2fr 0.8fr;
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
    .table-title {
      display: flex;
      justify-content: space-between;
      gap: 16px;
      align-items: center;
      padding: 15px 18px;
      background: var(--band);
      border-bottom: 1px solid var(--line);
    }
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
    td span { color: var(--muted); font-size: 0.82rem; margin-top: 3px; }
    code {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 0.78rem;
      color: oklch(0.34 0.05 225);
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
      font-size: 0.78rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .badge.good { color: var(--good); background: oklch(0.94 0.04 154); border-color: oklch(0.82 0.05 154); }
    .badge.warn { color: var(--warn); background: oklch(0.96 0.045 78); border-color: oklch(0.84 0.06 78); }
    .badge.bad { color: var(--bad); background: oklch(0.95 0.04 31); border-color: oklch(0.82 0.065 31); }
    .empty { color: var(--muted); }
    @media (max-width: 980px) {
      header, .grid { grid-template-columns: 1fr; }
      .statusbar { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    }
    @media (max-width: 680px) {
      header, main { padding-left: 16px; padding-right: 16px; }
      .statusbar { grid-template-columns: 1fr; }
      table, thead, tbody, tr, th, td { display: block; }
      thead { display: none; }
      tr { border-bottom: 1px solid var(--line); }
      th, td { border-bottom: 0; }
    }
  </style>
</head>
<body>
  <header>
    <div>
      <h1>Parallax Hosted Console</h1>
      <p class="subtle">${escapeHtml(saas.environment)} | ${escapeHtml(rootDir)}</p>
    </div>
    ${badge(providerValidation.status)}
  </header>
  <main>
    <div class="statusbar">
      <section><span>Managed Readiness</span><strong>${escapeHtml(readiness.status)}</strong></section>
      <section><span>Provider Contracts</span><strong>${escapeHtml(providerValidation.summary.contract_validated_count)} / ${escapeHtml(providerValidation.summary.provider_count)}</strong></section>
      <section><span>Tenants</span><strong>${escapeHtml(readiness.summary.tenant_count)}</strong></section>
      <section><span>Required Failures</span><strong>${escapeHtml(providerValidation.summary.required_failure_count)}</strong></section>
      <section><span>Production Providers</span><strong>${escapeHtml(providerValidation.summary.production_provider_count)}</strong></section>
    </div>

    <section class="panel">
      <div class="table-title"><h2>Provider Contracts</h2><span>${escapeHtml(generatedAt)}</span></div>
      <table>
        <thead><tr><th>Manifest</th><th>Provider</th><th>Contract</th><th>Manifest Status</th><th>Validation</th><th>Secret Ref</th><th>Failures</th></tr></thead>
        <tbody>${providerRows(providerValidation.providers)}</tbody>
      </table>
    </section>

    <div class="grid">
      <section class="panel">
        <div class="table-title"><h2>Tenants</h2><span>${escapeHtml(rootDir)}</span></div>
        <table>
          <thead><tr><th>Tenant</th><th>Status</th><th>Plan</th><th>Region</th><th>Residency</th><th>Audit Dir</th></tr></thead>
          <tbody>${tenantRows(readiness.tenants)}</tbody>
        </table>
      </section>

      <section class="panel">
        <div class="table-title"><h2>Control Plane</h2><span>${escapeHtml(saas.environment)}</span></div>
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
    </div>

    <section class="panel">
      <div class="table-title"><h2>Readiness Controls</h2><span>Required and warning gates</span></div>
      <table>
        <thead><tr><th>Control</th><th>Status</th><th>Severity</th><th>Detail</th></tr></thead>
        <tbody>${controlRows([...providerValidation.controls, ...readiness.controls])}</tbody>
      </table>
    </section>
  </main>
</body>
</html>`;
}

export async function writeHostedConsole({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  validationPath = providerValidationPath(rootDir),
  out = path.join(rootDir, "parallax-hosted-console.html"),
  now
}: {
  rootDir?: string;
  configPath?: string;
  validationPath?: string;
  out?: string;
  now?: string;
} = {}) {
  const html = await buildHostedConsoleHtml({ rootDir, configPath, validationPath, now });
  await mkdir(path.dirname(out), { recursive: true });
  await writeFile(out, html);
  return {
    out,
    root_dir: rootDir,
    validation_path: validationPath,
    bytes: Buffer.byteLength(html),
    generated_at: now ?? new Date().toISOString()
  };
}
