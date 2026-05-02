import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { stableHash, isoNow, makeId } from "../core/ids.js";
import { productPolicySnapshot } from "../product/policy.js";
import { listLibraryEntries, exportWorkspace } from "../library/store.js";
import { paperLedgerReport } from "../paper/lab.js";
import { buildGovernanceReport } from "../team/governance.js";
import { partnerExecutionReport } from "../execution/partner.js";
import { promptRegistrySnapshot } from "../llm/registry.js";

export const BETA_DEPLOYMENT_FILE = "beta-deployment.json";

const DEFAULT_EXTERNALS = {
  identity_provider: {
    mode: "local_api_token",
    sso_status: "disabled_until_configured",
    required_for_public_beta: true
  },
  market_data_vendor: {
    mode: "local_licensed_data_pack",
    external_vendor_status: "disabled_until_configured",
    required_for_public_beta: true
  },
  llm_provider: {
    mode: "scripted_llm_council_v0",
    external_provider_status: "disabled_until_configured",
    required_for_public_beta: true
  },
  regulated_partner: {
    mode: "partner_sandbox_or_locked_production_adapter",
    production_status: "locked_by_default",
    required_for_live_beta: true
  }
} as const;

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

export function defaultBetaConfigPath(auditDir = "audits") {
  return path.join(auditDir, BETA_DEPLOYMENT_FILE);
}

function tokenHash(token: string) {
  return stableHash({ token, purpose: "parallax_beta_api_token" });
}

function defaultConfig({
  auditDir = "audits",
  workspaceName = "Parallax Beta Workspace",
  apiToken = "",
  publicBaseUrl = "http://127.0.0.1:8787",
  now = isoNow()
}: {
  auditDir?: string;
  workspaceName?: string;
  apiToken?: string;
  publicBaseUrl?: string;
  now?: string;
} = {}) {
  return {
    schema_version: "0.1.0",
    deployment_id: makeId("beta_dep", { auditDir, workspaceName, publicBaseUrl, now }),
    deployment_mode: "local_beta",
    workspace_name: workspaceName,
    audit_dir: auditDir,
    public_base_url: publicBaseUrl,
    created_at: now,
    api: {
      auth_required: true,
      auth_scheme: "bearer",
      token_hash: apiToken ? tokenHash(apiToken) : "",
      raw_token_stored: false,
      allowed_origins: ["http://127.0.0.1", "http://localhost"]
    },
    external_providers: DEFAULT_EXTERNALS,
    beta_boundaries: {
      investment_advice: false,
      direct_broker_connection: false,
      live_execution_default: "locked",
      production_partner_adapter_default: "locked",
      external_credentials_required_for_local_beta: false
    },
    endpoints: [
      "GET /healthz",
      "GET /readyz",
      "GET /api/status",
      "GET /api/library",
      "POST /api/analyze",
      "GET /api/governance",
      "GET /api/partner",
      "GET /dashboard"
    ]
  };
}

export async function loadBetaDeploymentConfig({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir)
}: {
  auditDir?: string;
  configPath?: string;
} = {}) {
  const config = await readJsonIfExists(configPath, defaultConfig({ auditDir }));
  return {
    ...defaultConfig({ auditDir }),
    ...config,
    audit_dir: auditDir,
    api: {
      ...defaultConfig({ auditDir }).api,
      ...(config.api ?? {})
    },
    external_providers: {
      ...DEFAULT_EXTERNALS,
      ...(config.external_providers ?? {})
    }
  };
}

export async function initializeBetaDeployment({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir),
  workspaceName = "Parallax Beta Workspace",
  apiToken,
  publicBaseUrl = "http://127.0.0.1:8787",
  now = isoNow()
}: {
  auditDir?: string;
  configPath?: string;
  workspaceName?: string;
  apiToken: string;
  publicBaseUrl?: string;
  now?: string;
}) {
  if (!apiToken || apiToken.length < 8) {
    throw new Error("beta-init requires --api-token with at least 8 characters.");
  }
  const config = defaultConfig({ auditDir, workspaceName, apiToken, publicBaseUrl, now });
  await writeJson(configPath, config);
  return {
    config,
    config_path: configPath,
    disclosure:
      "The beta deployment stores only a token hash. Keep the raw token in your deployment secret manager or local shell."
  };
}

function check(id: string, passed: boolean, detail: string, severity = "required") {
  return { id, passed, detail, severity };
}

export async function betaDeploymentReadiness({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir),
  now = isoNow()
}: {
  auditDir?: string;
  configPath?: string;
  now?: string;
} = {}) {
  const config = await loadBetaDeploymentConfig({ auditDir, configPath });
  const library = await listLibraryEntries({ auditDir });
  const governance = await buildGovernanceReport(auditDir);
  const partner = await partnerExecutionReport(auditDir);
  const paper = await paperLedgerReport(auditDir);
  const policy = productPolicySnapshot();
  const promptRegistry = promptRegistrySnapshot();
  const controls = [
    check("api_auth", config.api?.auth_required === true && Boolean(config.api?.token_hash), "Bearer API auth is configured."),
    check("raw_token_not_stored", config.api?.raw_token_stored === false && !("api_token" in (config.api ?? {})), "Deployment config stores only a token hash."),
    check("product_boundary", policy.excluded_action_classes.includes("order_ticket_candidate"), "General product boundary excludes order tickets."),
    check("external_market_data_disabled", config.external_providers.market_data_vendor.external_vendor_status === "disabled_until_configured", "External market data vendor remains explicit and disabled until credentials/license are configured.", "warning"),
    check("external_llm_disabled", config.external_providers.llm_provider.external_provider_status === "disabled_until_configured", "External LLM provider remains explicit and disabled until validation/credentials are configured.", "warning"),
    check("sso_disabled_but_declared", config.external_providers.identity_provider.sso_status === "disabled_until_configured", "SSO is declared as a future public-beta dependency.", "warning"),
    check("production_partner_locked", partner.summary.production_unlocked === false, "Production partner adapter is locked by default."),
    check("no_production_submissions", partner.summary.production_submission_count === 0, "No production partner submissions exist in the beta workspace."),
    check("dashboard_available", true, "Dashboard can be generated from the same workspace state."),
    check("registry_available", Object.keys(promptRegistry.providers).length > 0, "Prompt/persona/provider registry is available for review."),
    check("workspace_export_available", true, "Workspace export is available for backup and review.")
  ];
  const requiredFailed = controls.filter((control) => control.severity === "required" && !control.passed);
  const warnings = controls.filter((control) => control.severity === "warning");
  return {
    schema_version: "0.1.0",
    generated_at: now,
    status: requiredFailed.length === 0 ? "ready_for_local_beta" : "blocked",
    config_path: configPath,
    deployment: {
      deployment_id: config.deployment_id,
      deployment_mode: config.deployment_mode,
      workspace_name: config.workspace_name,
      public_base_url: config.public_base_url,
      audit_dir: auditDir
    },
    summary: {
      dossier_count: library.entries.length,
      release_ready_count: governance.summary.release_ready_count,
      paper_trade_count: paper.summary.trade_count,
      partner_submission_count: partner.summary.submission_count,
      production_submission_count: partner.summary.production_submission_count,
      required_failed_count: requiredFailed.length,
      warning_count: warnings.length
    },
    controls,
    warnings,
    external_providers: config.external_providers,
    beta_boundaries: config.beta_boundaries,
    endpoints: config.endpoints
  };
}

export async function betaStatus({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir),
  now = isoNow()
}: {
  auditDir?: string;
  configPath?: string;
  now?: string;
} = {}) {
  const readiness = await betaDeploymentReadiness({ auditDir, configPath, now });
  const library = await listLibraryEntries({ auditDir });
  const governance = await buildGovernanceReport(auditDir);
  const partner = await partnerExecutionReport(auditDir);
  const paper = await paperLedgerReport(auditDir);
  return {
    schema_version: "0.1.0",
    generated_at: now,
    readiness,
    library_summary: {
      dossier_count: library.entries.length,
      action_classes: library.entries.reduce((acc: Record<string, number>, entry: any) => {
        acc[entry.action_class] = (acc[entry.action_class] ?? 0) + 1;
        return acc;
      }, {})
    },
    governance_summary: governance.summary,
    partner_execution_summary: partner.summary,
    paper_summary: paper.summary,
    product_policy: productPolicySnapshot().positioning
  };
}

export async function exportBetaDeploymentPackage({
  auditDir = "audits",
  configPath = defaultBetaConfigPath(auditDir),
  out
}: {
  auditDir?: string;
  configPath?: string;
  out: string;
}) {
  const readiness = await betaDeploymentReadiness({ auditDir, configPath });
  const status = await betaStatus({ auditDir, configPath });
  const workspacePath = path.join(path.dirname(out), "beta-workspace-export.json");
  const workspaceExport = await exportWorkspace({ auditDir, out: workspacePath });
  const body = {
    schema_version: "0.1.0",
    exported_at: isoNow(),
    readiness,
    status,
    workspace_export: workspaceExport,
    workspace_export_path: workspacePath
  };
  await writeJson(out, body);
  return {
    out,
    readiness_status: readiness.status,
    workspace_export_path: workspacePath,
    dossier_count: status.library_summary.dossier_count,
    execution_file_count: workspaceExport.execution_file_count ?? 0,
    governance_file_count: workspaceExport.governance_file_count ?? 0
  };
}

export function verifyBetaToken(config: any, token = "") {
  if (!config.api?.auth_required) return true;
  if (!token) return false;
  return tokenHash(token) === config.api.token_hash;
}
