#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  analyzeThesis,
  readAuditBundle,
  replayAuditBundle,
  evaluateLifecycle,
  productPolicySnapshot,
  promptRegistrySnapshot,
  runLLMEvalSuite
} from "../index.js";
import {
  alertPreferencesToHumanReport,
  alertsToHumanReport,
  appToHumanReport,
  betaExportToHumanReport,
  betaInitToHumanReport,
  betaReadinessToHumanReport,
  betaServeToHumanReport,
  betaStatusToHumanReport,
  dataStatusToHumanReport,
  dataVendorAdapterToHumanReport,
  dataVendorImportToHumanReport,
  dataVendorStatusToHumanReport,
  dossierToHumanReport,
  dossierToMarkdown,
  durableObjectToHumanReport,
  durableStorageStatusToHumanReport,
  exportToHumanReport,
  feedbackSummaryToHumanReport,
  feedbackToHumanReport,
  hostedApiStatusToHumanReport,
  hostedConsoleToHumanReport,
  hostedFoundationStatusToHumanReport,
  hostedServeToHumanReport,
  identitySessionToHumanReport,
  identityStatusToHumanReport,
  importToHumanReport,
  libraryToHumanReport,
  lifecycleNotificationsToHumanReport,
  lifecycleOverridesToHumanReport,
  lifecycleTriggerToHumanReport,
  llmEvalToHumanReport,
  monitorToHumanReport,
  paperCloseToHumanReport,
  paperLedgerToHumanReport,
  paperOpenToHumanReport,
  paperReviewToHumanReport,
  paperToHumanReport,
  partnerControlsToHumanReport,
  partnerHumanApprovalToHumanReport,
  partnerKillSwitchToHumanReport,
  partnerLegalApprovalToHumanReport,
  partnerMarketReviewToHumanReport,
  partnerPostTradeReviewToHumanReport,
  partnerRegisterToHumanReport,
  partnerReportToHumanReport,
  partnerSubmitToHumanReport,
  partnerTicketToHumanReport,
  policyToHumanReport,
  portfolioImportToHumanReport,
  providerValidationToHumanReport,
  promptRegistryToHumanReport,
  replayToHumanReport,
  saasExportToHumanReport,
  saasInitToHumanReport,
  saasReadinessToHumanReport,
  saasStatusToHumanReport,
  secretRefToHumanReport,
  sandboxToHumanReport,
  sourcesToHumanReport,
  storageCheckpointToHumanReport,
  tenantCreateToHumanReport,
  tenantPersistenceToHumanReport,
  teamApprovalToHumanReport,
  teamAssignmentToHumanReport,
  teamCommentToHumanReport,
  teamGovernanceExportToHumanReport,
  teamGovernanceToHumanReport,
  teamInitToHumanReport,
  teamMemberToHumanReport,
  externalIntegrationToHumanReport,
  observabilityEventToHumanReport
} from "../render.js";
import { createPaperTicket, simulatePaperFill } from "../paper/trading.js";
import {
  closeLedgerTrade,
  openPaperTrade,
  paperLedgerReport,
  recordPaperReview
} from "../paper/lab.js";
import { ApprovalStore, SandboxBroker, KillSwitch } from "../execution/sandbox.js";
import {
  exportWorkspace,
  filterWatchlistEntries,
  importWorkspace,
  listLibraryEntries,
  monitorWorkspace,
  recordFeedback,
  summarizeFeedback,
  sourceViewFromAudit,
  upsertLibraryEntry
} from "../library/store.js";
import {
  addLifecycleTrigger,
  disableLifecycleTrigger,
  readAlertPreferences,
  readLifecycleNotifications,
  readLifecycleOverrides,
  updateAlertPreferences
} from "../lifecycle/workspace.js";
import { writeDashboard } from "../app/dashboard.js";
import { writeHostedConsole } from "../app/hosted_console.js";
import { buildDataStatus } from "../data/status.js";
import { writePortfolioJson } from "../data/portfolio.js";
import {
  addTeamMember,
  approveGovernanceReview,
  assignGovernanceReview,
  buildGovernanceReport,
  exportGovernancePackage,
  initializeTeamWorkspace,
  recordGovernanceComment
} from "../team/governance.js";
import {
  approvePartnerOrder,
  createPartnerOrderTicket,
  evaluatePartnerOrderControls,
  partnerExecutionReport,
  recordLegalApproval,
  recordMarketAccessReview,
  recordPostTradeReview,
  registerExecutionPartner,
  submitPartnerOrder,
  updatePartnerKillSwitch
} from "../execution/partner.js";
import {
  betaDeploymentReadiness,
  betaStatus,
  defaultBetaConfigPath,
  exportBetaDeploymentPackage,
  initializeBetaDeployment
} from "../beta/deployment.js";
import { startBetaServer } from "../beta/server.js";
import {
  createManagedTenant,
  exportManagedSaasPackage,
  initializeManagedSaas,
  managedSaasConfigPath,
  managedSaasReadiness,
  managedSaasStatus,
  recordObservabilityEvent,
  registerExternalIntegration,
  registerSecretReference
} from "../saas/managed.js";
import {
  providerValidationPath,
  validateProviderContracts
} from "../providers/validation.js";
import {
  hostedApiStatus,
  hostedApiTokenHash,
  hostedFoundationStatus,
  startHostedServer
} from "../saas/server.js";
import {
  saveTenantStateValue,
  tenantPersistenceStatus
} from "../saas/persistence.js";
import {
  identityStatus,
  initializeIdentityDirectory,
  issueIdentitySession,
  registerIdentityPrincipal
} from "../saas/identity.js";
import {
  createStorageCheckpoint,
  durableStorageStatus,
  initializeDurableStorage,
  writeDurableObject
} from "../saas/storage.js";
import {
  dataVendorStatus,
  importDataVendorPack,
  registerDataVendorAdapter
} from "../saas/data_vendor.js";

type CliArgs = Record<string, string | boolean>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    }
  }
  return args;
}

function usage() {
  return `Parallax CLI

Commands:
  analyze --symbol NVDA --horizon swing --thesis "post-earnings continuation" [--ceiling watchlist]
  llm-eval [--out artifacts/phase_3_llm_council_beta/llm-eval.json]
  prompt-registry
  replay --audit audits/dos_x.json
  monitor --audit audits/dos_x.json --price 1050 --now 2026-05-01T15:00:00Z
  library [--audit-dir audits]
  watchlist [--audit-dir audits]
  alerts [--audit-dir audits] [--prices NVDA=111,TSLA=240]
  alert-prefs [--audit-dir audits] [--mute NVDA] [--unmute NVDA] [--min-freshness 0.35]
  trigger-add --audit audits/dos_x.json --kind recheck --condition-type price --condition "last_price > 120" --rationale "..."
  trigger-disable --audit audits/dos_x.json --trigger trig_x
  triggers [--audit-dir audits]
  notifications [--audit-dir audits]
  data-status --symbol NVDA [--data-dir fixtures]
  sources --audit audits/dos_x.json
  feedback --audit audits/dos_x.json --rating useful [--notes "..."]
  feedback-summary [--audit-dir audits]
  export --audit-dir audits --out parallax-workspace.json
  import --in parallax-workspace.json --audit-dir imported-audits
  app --audit-dir audits [--out audits/parallax-dashboard.html]
  portfolio-import --csv broker.csv --out fixtures/portfolio/default.json
  policy
  paper --audit audits/dos_x.json
  paper-open --audit audits/dos_x.json [--risk-budget 0.01] [--market-price 115]
  paper-close --trade paper_trade_x --exit-price 118 [--reason target_reached]
  paper-ledger [--audit-dir audits]
  paper-review --trade paper_trade_x --rating disciplined [--notes "..."]
  team-init [--audit-dir audits] [--workspace-name "Research Desk"] [--owner "Nikola"]
  team-member-add --name "Rina" --role risk_reviewer --actor "Owner" [--email rina@example.com]
  team-assign --audit audits/dos_x.json --type risk_review --assignee "Rina" --requester "Owner"
  team-comment --audit audits/dos_x.json --author "Rina" --body "..."
  team-approve --assignment review_x --approver "Rina" --decision approved --rationale "..."
  team-report [--audit-dir audits]
  team-export --audit-dir audits --out governance-package.json
  partner-register --partner-id sandbox_a --name "Regulated Partner Sandbox"
  partner-legal-approve --partner-id sandbox_a --approver "Counsel" [--scope sandbox]
  partner-market-review --partner-id sandbox_a --reviewer "Market Access" [--allowed-symbols NVDA]
  partner-ticket --audit audits/dos_x.json --partner-id sandbox_a [--environment sandbox]
  partner-approve --ticket partner_ticket_x --approver "human"
  partner-controls --ticket partner_ticket_x
  partner-submit --ticket partner_ticket_x
  partner-post-review --submission partner_submission_x --reviewer "Ops" --outcome acceptable
  partner-report [--audit-dir audits]
  partner-kill-switch --enabled true --reason "market halt"
  beta-init --audit-dir audits --api-token "dev-secret-token" [--workspace-name "Beta Desk"]
  beta-readiness [--audit-dir audits]
  beta-status [--audit-dir audits]
  beta-export --audit-dir audits --out beta-deployment-package.json
  beta-serve [--audit-dir audits] [--host 127.0.0.1] [--port 8787]
  saas-init [--root-dir managed-saas] [--owner "Platform Owner"]
  tenant-create --root-dir managed-saas --slug alpha --name "Alpha Research"
  secret-ref-add --root-dir managed-saas --name MARKET_DATA --scope market_data_vendor --ref secret://vendor/key
  integration-add --root-dir managed-saas --kind market_data_vendor --name "Market Data" --provider "Vendor"
  observability-record --root-dir managed-saas --type control_check [--tenant alpha] [--message "..."]
  saas-readiness [--root-dir managed-saas]
  saas-status [--root-dir managed-saas]
  saas-export --root-dir managed-saas --out managed-saas-package.json
  provider-validate [--root-dir managed-saas] [--out managed-saas/provider-validation.json]
  provider-status [--root-dir managed-saas]
  hosted-console [--root-dir managed-saas] [--out managed-saas/parallax-hosted-console.html]
  hosted-api-status [--root-dir managed-saas] [--api-token "..."]
  tenant-persistence [--root-dir managed-saas] [--tenant alpha]
  tenant-state-set --root-dir managed-saas --tenant alpha --key watchlist.filter --value '{"symbols":["NVDA"]}'
  hosted-serve --root-dir managed-saas --api-token "dev-secret-token" [--host 127.0.0.1] [--port 8888]
  identity-init [--root-dir managed-saas] [--issuer parallax-local-identity]
  identity-principal-add --root-dir managed-saas --email analyst@example.com --name "Analyst" [--tenant alpha] [--role analyst] [--scopes tenant:read,analysis:create]
  identity-session-issue --root-dir managed-saas --email analyst@example.com [--tenant alpha] [--ttl-minutes 60]
  identity-status [--root-dir managed-saas]
  storage-init [--root-dir managed-saas] [--provider local_durable_storage]
  storage-object-put --root-dir managed-saas --tenant alpha --key screen.cache --value '{"symbols":["NVDA"]}'
  storage-checkpoint [--root-dir managed-saas] [--tenant alpha] [--label nightly]
  storage-status [--root-dir managed-saas]
  hosted-foundation-status [--root-dir managed-saas] [--api-token "..."]
  data-vendor-register --root-dir managed-saas --tenant alpha --adapter licensed-local --name "Licensed Local Vendor" --provider licensed_vendor --secret-ref MARKET_DATA_VENDOR --data-license licensed_for_internal_research [--allowed-symbols NVDA,QQQ]
  data-vendor-import --root-dir managed-saas --tenant alpha --adapter licensed-local --symbol NVDA --source-dir fixtures
  data-vendor-status [--root-dir managed-saas] [--tenant alpha]
  sandbox-submit --audit audits/dos_x.json --approver "human"

Common flags:
  --json                 Print machine-readable JSON instead of human-readable output.
  --format json|human    Same as --json, but explicit.
  --data-dir fixtures    Directory containing market/events/portfolio fixture data.
  --audit-dir audits     Directory where analyze writes audit artifacts.
  --user-class           self_directed_investor, independent_analyst, research_team, trading_educator, professional_reviewer.
  --intended-use         research, education, paper_trading, team_review, governance_review.
  --council-mode         deterministic or llm-scripted.
  --llm-scenario         safe, hallucinated_ref, numeric_fabrication, hidden_recommendation, prompt_injection_obedience.
  --llm-budget-tokens    Maximum context tokens for LLM provider path.
  --llm-budget-usd       Maximum estimated cost for LLM provider path.
  --events               Symbol event flags, for alerts: NVDA=true,TSLA=false.
  --vols                 Symbol volatility overrides, for alerts: NVDA=0.9.
  --tags                 Comma-separated governance comment tags.
  --config               Beta deployment config path.
  --root-dir             Managed SaaS control-plane root directory.
`;
}

function wantsJson(args: CliArgs) {
  return args.json === true || args.format === "json";
}

function printResult(args: CliArgs, human: string, json: any) {
  if (wantsJson(args)) console.log(JSON.stringify(json, null, 2));
  else console.log(human);
}

function parsePrices(value?: string | boolean) {
  const prices: Record<string, number> = {};
  if (!value || value === true) return prices;
  for (const part of String(value).split(",")) {
    const [symbol, rawPrice] = part.split("=");
    if (!symbol || !rawPrice) continue;
    const price = Number(rawPrice);
    if (!Number.isNaN(price)) prices[symbol.toUpperCase()] = price;
  }
  return prices;
}

function parseBooleanMap(value?: string | boolean) {
  const mapped: Record<string, boolean> = {};
  if (!value || value === true) return mapped;
  for (const part of String(value).split(",")) {
    const [symbol, raw] = part.split("=");
    if (!symbol || raw === undefined) continue;
    mapped[symbol.toUpperCase()] = raw === "true" || raw === "1" || raw === "yes";
  }
  return mapped;
}

function parseCsvList(value?: string | boolean) {
  if (!value || value === true) return undefined;
  return String(value).split(",").map((item) => item.trim()).filter(Boolean);
}

function parseOptionalBoolean(value?: string | boolean) {
  if (value === undefined) return undefined;
  if (value === true) return true;
  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function parseRequiredBoolean(value?: string | boolean, fallback = false) {
  const parsed = parseOptionalBoolean(value);
  return parsed === undefined ? fallback : parsed;
}

function parseLLMBudget(args: CliArgs) {
  const budget: any = {};
  if (args["llm-budget-tokens"] && args["llm-budget-tokens"] !== true) {
    budget.maxContextTokens = Number(args["llm-budget-tokens"]);
  }
  if (args["llm-budget-usd"] && args["llm-budget-usd"] !== true) {
    budget.maxEstimatedCostUsd = Number(args["llm-budget-usd"]);
  }
  return Object.keys(budget).length ? budget : undefined;
}

function parseJsonObject(value?: string | boolean) {
  if (!value || value === true) return {};
  const parsed = JSON.parse(String(value));
  if (!parsed || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("--metadata must be a JSON object");
  }
  return parsed;
}

function parseJsonValue(value?: string | boolean) {
  if (!value || value === true) return {};
  return JSON.parse(String(value));
}

function saasPaths(args: CliArgs) {
  const rootDir = String(args["root-dir"] ?? "managed-saas");
  const configPath = args.config ? String(args.config) : managedSaasConfigPath(rootDir);
  return { rootDir, configPath };
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || args.help) {
    console.log(usage());
    return;
  }

  if (command === "analyze") {
    if (!args.symbol || !args.thesis) throw new Error("analyze requires --symbol and --thesis");
    const auditDir = String(args["audit-dir"] ?? "audits");
    const dossier = await analyzeThesis({
      symbol: String(args.symbol),
      horizon: String(args.horizon ?? "swing"),
      thesis: String(args.thesis),
      dataDir: String(args["data-dir"] ?? "fixtures"),
      actionCeiling: String(args.ceiling ?? "watchlist"),
      userClass: String(args["user-class"] ?? "self_directed_investor"),
      intendedUse: String(args["intended-use"] ?? "research"),
      audit: true,
      now: args.now ? String(args.now) : undefined,
      auditDir,
      councilMode: String(args["council-mode"] ?? "deterministic"),
      llmScenario: String(args["llm-scenario"] ?? "safe"),
      llmBudget: parseLLMBudget(args)
    });
    const auditPath = path.join(auditDir, `${dossier.id}.json`);
    const markdownPath = path.join(auditDir, `${dossier.id}.md`);
    await writeFile(markdownPath, dossierToMarkdown(dossier));
    await upsertLibraryEntry({ auditDir, dossier, auditPath, markdownPath });
    const result = {
      dossier_id: dossier.id,
      action_class: dossier.decision_packet.action_class,
      thesis_state: dossier.lifecycle.state,
      confidence: dossier.decision_packet.confidence,
      freshness_score: dossier.lifecycle.freshness_score,
      policy_status: dossier.policy_review.status,
      effective_action_ceiling: dossier.policy_review.effective_action_ceiling,
      council_provider: dossier.council_run.provider.id,
      council_eval_passed: dossier.council_run.eval_report.passed,
      llm_usage: dossier.council_run.usage,
      audit_path: auditPath,
      markdown_path: markdownPath,
      library_path: path.join(auditDir, "library.json")
    };
    printResult(args, dossierToHumanReport(dossier, { auditPath, markdownPath }), result);
    return;
  }

  if (command === "policy") {
    const policy = productPolicySnapshot();
    printResult(args, policyToHumanReport(policy), policy);
    return;
  }

  if (command === "prompt-registry") {
    const registry = promptRegistrySnapshot();
    printResult(args, promptRegistryToHumanReport(registry), registry);
    return;
  }

  if (command === "llm-eval") {
    const report = await runLLMEvalSuite({
      dataDir: String(args["data-dir"] ?? "fixtures"),
      now: args.now ? String(args.now) : undefined
    });
    if (args.out && args.out !== true) {
      await mkdir(path.dirname(String(args.out)), { recursive: true });
      await writeFile(String(args.out), `${JSON.stringify(report, null, 2)}\n`);
    }
    printResult(args, llmEvalToHumanReport(report), report);
    return;
  }

  if (command === "library") {
    const library = await listLibraryEntries({
      auditDir: String(args["audit-dir"] ?? "audits"),
      symbol: args.symbol ? String(args.symbol) : undefined,
      state: args.state ? String(args.state) : undefined,
      action: args.action ? String(args.action) : undefined
    });
    printResult(args, libraryToHumanReport(library), library);
    return;
  }

  if (command === "watchlist") {
    const library = await listLibraryEntries({
      auditDir: String(args["audit-dir"] ?? "audits"),
      symbol: args.symbol ? String(args.symbol) : undefined
    });
    const watchlist = {
      ...library,
      entries: filterWatchlistEntries(library.entries)
    };
    printResult(args, libraryToHumanReport(watchlist, { title: "Parallax Watchlist" }), watchlist);
    return;
  }

  if (command === "alerts") {
    const alerts = await monitorWorkspace({
      auditDir: String(args["audit-dir"] ?? "audits"),
      now: args.now ? String(args.now) : undefined,
      prices: parsePrices(args.prices),
      events: parseBooleanMap(args.events),
      annualizedVolatility: parsePrices(args.vols)
    });
    printResult(args, alertsToHumanReport(alerts), alerts);
    return;
  }

  if (command === "alert-prefs") {
    const auditDir = String(args["audit-dir"] ?? "audits");
    const hasUpdate = args.mute || args.unmute || args.channels || args["min-freshness"] || args["quiet-unchanged"] || args.states || args.triggers;
    const preferences = hasUpdate
      ? await updateAlertPreferences({
        auditDir,
        mute: parseCsvList(args.mute) ?? [],
        unmute: parseCsvList(args.unmute) ?? [],
        channels: parseCsvList(args.channels),
        quietUnchanged: parseOptionalBoolean(args["quiet-unchanged"]),
        notifyOnStates: parseCsvList(args.states),
        notifyOnTriggerKinds: parseCsvList(args.triggers),
        minFreshnessScore: args["min-freshness"] && args["min-freshness"] !== true ? Number(args["min-freshness"]) : undefined
      })
      : await readAlertPreferences(auditDir);
    printResult(args, alertPreferencesToHumanReport(preferences), preferences);
    return;
  }

  if (command === "trigger-add") {
    if (!args.audit) throw new Error("trigger-add requires --audit");
    for (const required of ["kind", "condition-type", "condition", "rationale"]) {
      if (!args[required]) throw new Error(`trigger-add requires --${required}`);
    }
    const result = await addLifecycleTrigger({
      auditPath: String(args.audit),
      auditDir: String(args["audit-dir"] ?? path.dirname(String(args.audit))),
      kind: String(args.kind),
      conditionType: String(args["condition-type"]),
      condition: String(args.condition),
      rationale: String(args.rationale),
      linkedAssumption: args.assumption ? String(args.assumption) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, lifecycleTriggerToHumanReport(result), result);
    return;
  }

  if (command === "trigger-disable") {
    if (!args.audit) throw new Error("trigger-disable requires --audit");
    if (!args.trigger) throw new Error("trigger-disable requires --trigger");
    const result = await disableLifecycleTrigger({
      auditPath: String(args.audit),
      auditDir: String(args["audit-dir"] ?? path.dirname(String(args.audit))),
      triggerId: String(args.trigger),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, lifecycleOverridesToHumanReport({
      audit_dir: result.audit_dir,
      overrides: { [result.dossier_id]: result.override }
    }), result);
    return;
  }

  if (command === "triggers") {
    const overrides = await readLifecycleOverrides(String(args["audit-dir"] ?? "audits"));
    printResult(args, lifecycleOverridesToHumanReport(overrides), overrides);
    return;
  }

  if (command === "notifications") {
    const notifications = await readLifecycleNotifications(String(args["audit-dir"] ?? "audits"));
    printResult(args, lifecycleNotificationsToHumanReport(notifications), notifications);
    return;
  }

  if (command === "sources") {
    if (!args.audit) throw new Error("sources requires --audit");
    const view = await sourceViewFromAudit(String(args.audit));
    printResult(args, sourcesToHumanReport(view), view);
    return;
  }

  if (command === "data-status") {
    if (!args.symbol) throw new Error("data-status requires --symbol");
    const status = await buildDataStatus({
      dataDir: String(args["data-dir"] ?? "fixtures"),
      symbol: String(args.symbol),
      horizon: String(args.horizon ?? "swing"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, dataStatusToHumanReport(status), status);
    return;
  }

  if (command === "portfolio-import") {
    if (!args.csv) throw new Error("portfolio-import requires --csv");
    if (!args.out) throw new Error("portfolio-import requires --out");
    const imported = await writePortfolioJson({
      csvPath: String(args.csv),
      out: String(args.out),
      accountId: args["account-id"] ? String(args["account-id"]) : undefined,
      cash: args.cash ? Number(args.cash) : undefined,
      totalEquity: args["total-equity"] ? Number(args["total-equity"]) : undefined,
      restrictedSymbols: args.restricted ? String(args.restricted).split(",").filter(Boolean) : []
    });
    printResult(args, portfolioImportToHumanReport(imported), imported);
    return;
  }

  if (command === "feedback") {
    if (!args.audit) throw new Error("feedback requires --audit");
    if (!args.rating) throw new Error("feedback requires --rating");
    const feedback = await recordFeedback({
      auditPath: String(args.audit),
      rating: String(args.rating),
      notes: args.notes ? String(args.notes) : "",
      reviewer: args.reviewer ? String(args.reviewer) : "local_alpha_user",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, feedbackToHumanReport(feedback), feedback);
    return;
  }

  if (command === "feedback-summary") {
    const summary = await summarizeFeedback(String(args["audit-dir"] ?? "audits"));
    printResult(args, feedbackSummaryToHumanReport(summary), summary);
    return;
  }

  if (command === "export") {
    if (!args.out) throw new Error("export requires --out");
    const exported = await exportWorkspace({
      auditDir: String(args["audit-dir"] ?? "audits"),
      out: String(args.out)
    });
    printResult(args, exportToHumanReport(exported), exported);
    return;
  }

  if (command === "import") {
    if (!args.in) throw new Error("import requires --in");
    const imported = await importWorkspace({
      input: String(args.in),
      auditDir: String(args["audit-dir"] ?? "audits")
    });
    printResult(args, importToHumanReport(imported), imported);
    return;
  }

  if (command === "app") {
    const app = await writeDashboard({
      auditDir: String(args["audit-dir"] ?? "audits"),
      out: args.out ? String(args.out) : undefined,
      now: args.now ? String(args.now) : undefined,
      prices: parsePrices(args.prices),
      events: parseBooleanMap(args.events),
      annualizedVolatility: parsePrices(args.vols)
    });
    printResult(args, appToHumanReport(app), app);
    return;
  }

  if (command === "replay") {
    if (!args.audit) throw new Error("replay requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const replay = replayAuditBundle(bundle);
    printResult(args, replayToHumanReport(replay), replay);
    return;
  }

  if (command === "monitor") {
    if (!args.audit) throw new Error("monitor requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const lastPrice = args.price ? Number(args.price) : bundle.dossier.tool_outputs.find((output: any) => output.tool_name === "return_summary").result.latest_close;
    const updated = evaluateLifecycle(bundle.dossier.lifecycle, {
      now: String(args.now ?? new Date().toISOString()),
      last_price: lastPrice,
      annualized_volatility_20: args.vol ? Number(args.vol) : 0.3,
      material_event_arrives: args.event === "true"
    });
    printResult(args, monitorToHumanReport(updated), updated);
    return;
  }

  if (command === "paper") {
    if (!args.audit) throw new Error("paper requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const ticket = createPaperTicket(bundle.dossier);
    const filled = simulatePaperFill(ticket);
    const result = { ticket, filled };
    printResult(args, paperToHumanReport(result), result);
    return;
  }

  if (command === "paper-open") {
    if (!args.audit) throw new Error("paper-open requires --audit");
    const result = await openPaperTrade({
      auditPath: String(args.audit),
      auditDir: String(args["audit-dir"] ?? path.dirname(String(args.audit))),
      side: args.side ? String(args.side) : "buy",
      riskBudgetPct: args["risk-budget"] && args["risk-budget"] !== true ? Number(args["risk-budget"]) : undefined,
      marketPrice: args["market-price"] && args["market-price"] !== true ? Number(args["market-price"]) : undefined,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, paperOpenToHumanReport(result), result);
    return;
  }

  if (command === "paper-close") {
    if (!args.trade) throw new Error("paper-close requires --trade");
    if (!args["exit-price"]) throw new Error("paper-close requires --exit-price");
    const result = await closeLedgerTrade({
      auditDir: String(args["audit-dir"] ?? "audits"),
      tradeId: String(args.trade),
      exitPrice: Number(args["exit-price"]),
      reason: args.reason ? String(args.reason) : "manual_close",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, paperCloseToHumanReport(result), result);
    return;
  }

  if (command === "paper-ledger") {
    const report = await paperLedgerReport(String(args["audit-dir"] ?? "audits"));
    printResult(args, paperLedgerToHumanReport(report), report);
    return;
  }

  if (command === "paper-review") {
    if (!args.trade) throw new Error("paper-review requires --trade");
    if (!args.rating) throw new Error("paper-review requires --rating");
    const result = await recordPaperReview({
      auditDir: String(args["audit-dir"] ?? "audits"),
      tradeId: String(args.trade),
      rating: String(args.rating),
      notes: args.notes ? String(args.notes) : "",
      reviewer: args.reviewer ? String(args.reviewer) : "paper_lab_user",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, paperReviewToHumanReport(result), result);
    return;
  }

  if (command === "team-init") {
    const result = await initializeTeamWorkspace({
      auditDir: String(args["audit-dir"] ?? "audits"),
      workspaceName: String(args["workspace-name"] ?? "Parallax Team Workspace"),
      owner: String(args.owner ?? "workspace_owner"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, teamInitToHumanReport(result), result);
    return;
  }

  if (command === "team-member-add") {
    if (!args.name) throw new Error("team-member-add requires --name");
    if (!args.role) throw new Error("team-member-add requires --role");
    const result = await addTeamMember({
      auditDir: String(args["audit-dir"] ?? "audits"),
      name: String(args.name),
      role: String(args.role),
      email: args.email ? String(args.email) : "",
      actor: args.actor ? String(args.actor) : undefined,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, teamMemberToHumanReport(result), result);
    return;
  }

  if (command === "team-assign") {
    if (!args.audit) throw new Error("team-assign requires --audit");
    if (!args.type) throw new Error("team-assign requires --type");
    if (!args.assignee) throw new Error("team-assign requires --assignee");
    if (!args.requester) throw new Error("team-assign requires --requester");
    const result = await assignGovernanceReview({
      auditPath: String(args.audit),
      auditDir: String(args["audit-dir"] ?? path.dirname(String(args.audit))),
      reviewType: String(args.type),
      assignee: String(args.assignee),
      requester: args.requester ? String(args.requester) : "",
      dueAt: args["due-at"] ? String(args["due-at"]) : "",
      note: args.note ? String(args.note) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, teamAssignmentToHumanReport(result), result);
    return;
  }

  if (command === "team-comment") {
    if (!args.audit) throw new Error("team-comment requires --audit");
    if (!args.author) throw new Error("team-comment requires --author");
    if (!args.body) throw new Error("team-comment requires --body");
    const result = await recordGovernanceComment({
      auditPath: String(args.audit),
      auditDir: String(args["audit-dir"] ?? path.dirname(String(args.audit))),
      author: String(args.author),
      body: String(args.body),
      tags: parseCsvList(args.tags) ?? [],
      visibility: args.visibility ? String(args.visibility) : "team",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, teamCommentToHumanReport(result), result);
    return;
  }

  if (command === "team-approve") {
    if (!args.assignment) throw new Error("team-approve requires --assignment");
    if (!args.approver) throw new Error("team-approve requires --approver");
    const result = await approveGovernanceReview({
      auditDir: String(args["audit-dir"] ?? "audits"),
      assignmentId: String(args.assignment),
      approver: String(args.approver),
      decision: args.decision ? String(args.decision) : "approved",
      rationale: args.rationale ? String(args.rationale) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, teamApprovalToHumanReport(result), result);
    return;
  }

  if (command === "team-report") {
    const report = await buildGovernanceReport(String(args["audit-dir"] ?? "audits"));
    printResult(args, teamGovernanceToHumanReport(report), report);
    return;
  }

  if (command === "team-export") {
    if (!args.out) throw new Error("team-export requires --out");
    const result = await exportGovernancePackage({
      auditDir: String(args["audit-dir"] ?? "audits"),
      out: String(args.out)
    });
    printResult(args, teamGovernanceExportToHumanReport(result), result);
    return;
  }

  if (command === "partner-register") {
    if (!args["partner-id"]) throw new Error("partner-register requires --partner-id");
    if (!args.name) throw new Error("partner-register requires --name");
    const result = await registerExecutionPartner({
      auditDir: String(args["audit-dir"] ?? "audits"),
      partnerId: String(args["partner-id"]),
      name: String(args.name),
      environment: String(args.environment ?? "sandbox"),
      regulated: parseRequiredBoolean(args.regulated, true),
      productionEnabled: parseRequiredBoolean(args["production-enabled"], false),
      productionAdapterStatus: String(args["production-adapter-status"] ?? "locked"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerRegisterToHumanReport(result), result);
    return;
  }

  if (command === "partner-legal-approve") {
    if (!args["partner-id"]) throw new Error("partner-legal-approve requires --partner-id");
    if (!args.approver) throw new Error("partner-legal-approve requires --approver");
    const result = await recordLegalApproval({
      auditDir: String(args["audit-dir"] ?? "audits"),
      partnerId: String(args["partner-id"]),
      approver: String(args.approver),
      authority: String(args.authority ?? "legal_compliance"),
      scope: String(args.scope ?? "sandbox"),
      decision: String(args.decision ?? "approved"),
      memo: args.memo ? String(args.memo) : "",
      expiresAt: args["expires-at"] ? String(args["expires-at"]) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerLegalApprovalToHumanReport(result), result);
    return;
  }

  if (command === "partner-market-review") {
    if (!args["partner-id"]) throw new Error("partner-market-review requires --partner-id");
    if (!args.reviewer) throw new Error("partner-market-review requires --reviewer");
    const result = await recordMarketAccessReview({
      auditDir: String(args["audit-dir"] ?? "audits"),
      partnerId: String(args["partner-id"]),
      reviewer: String(args.reviewer),
      environment: String(args.environment ?? "sandbox"),
      decision: String(args.decision ?? "approved"),
      maxOrderNotional: args["max-order-notional"] && args["max-order-notional"] !== true ? Number(args["max-order-notional"]) : 1000,
      maxDailyNotional: args["max-daily-notional"] && args["max-daily-notional"] !== true ? Number(args["max-daily-notional"]) : 5000,
      allowedSymbols: parseCsvList(args["allowed-symbols"]) ?? [],
      restrictedSymbols: parseCsvList(args["restricted-symbols"]) ?? [],
      allowedSides: parseCsvList(args["allowed-sides"]) ?? ["buy"],
      shortingAllowed: parseRequiredBoolean(args["shorting-allowed"], false),
      notes: args.notes ? String(args.notes) : "",
      expiresAt: args["expires-at"] ? String(args["expires-at"]) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerMarketReviewToHumanReport(result), result);
    return;
  }

  if (command === "partner-ticket") {
    if (!args.audit) throw new Error("partner-ticket requires --audit");
    if (!args["partner-id"]) throw new Error("partner-ticket requires --partner-id");
    const result = await createPartnerOrderTicket({
      auditPath: String(args.audit),
      auditDir: String(args["audit-dir"] ?? path.dirname(String(args.audit))),
      partnerId: String(args["partner-id"]),
      environment: String(args.environment ?? "sandbox"),
      side: args.side ? String(args.side) : "buy",
      riskBudgetPct: args["risk-budget"] && args["risk-budget"] !== true ? Number(args["risk-budget"]) : undefined,
      orderType: String(args["order-type"] ?? "market"),
      timeInForce: String(args["time-in-force"] ?? "day"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerTicketToHumanReport(result), result);
    return;
  }

  if (command === "partner-approve") {
    if (!args.ticket) throw new Error("partner-approve requires --ticket");
    if (!args.approver) throw new Error("partner-approve requires --approver");
    const result = await approvePartnerOrder({
      auditDir: String(args["audit-dir"] ?? "audits"),
      ticketId: String(args.ticket),
      approver: String(args.approver),
      rationale: args.rationale ? String(args.rationale) : "",
      expiresAt: args["expires-at"] ? String(args["expires-at"]) : undefined,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerHumanApprovalToHumanReport(result), result);
    return;
  }

  if (command === "partner-controls") {
    if (!args.ticket) throw new Error("partner-controls requires --ticket");
    const result = await evaluatePartnerOrderControls({
      auditDir: String(args["audit-dir"] ?? "audits"),
      ticketId: String(args.ticket),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerControlsToHumanReport(result), result);
    return;
  }

  if (command === "partner-submit") {
    if (!args.ticket) throw new Error("partner-submit requires --ticket");
    const result = await submitPartnerOrder({
      auditDir: String(args["audit-dir"] ?? "audits"),
      ticketId: String(args.ticket),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerSubmitToHumanReport(result), result);
    return;
  }

  if (command === "partner-post-review") {
    if (!args.submission) throw new Error("partner-post-review requires --submission");
    if (!args.reviewer) throw new Error("partner-post-review requires --reviewer");
    const result = await recordPostTradeReview({
      auditDir: String(args["audit-dir"] ?? "audits"),
      submissionId: String(args.submission),
      reviewer: String(args.reviewer),
      outcome: String(args.outcome ?? "acceptable"),
      notes: args.notes ? String(args.notes) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerPostTradeReviewToHumanReport(result), result);
    return;
  }

  if (command === "partner-report") {
    const result = await partnerExecutionReport(String(args["audit-dir"] ?? "audits"));
    printResult(args, partnerReportToHumanReport(result), result);
    return;
  }

  if (command === "partner-kill-switch") {
    if (args.enabled === undefined) throw new Error("partner-kill-switch requires --enabled true|false");
    const result = await updatePartnerKillSwitch({
      auditDir: String(args["audit-dir"] ?? "audits"),
      enabled: parseRequiredBoolean(args.enabled, false),
      reason: args.reason ? String(args.reason) : "manual",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, partnerKillSwitchToHumanReport(result), result);
    return;
  }

  if (command === "beta-init") {
    if (!args["api-token"]) throw new Error("beta-init requires --api-token");
    const auditDir = String(args["audit-dir"] ?? "audits");
    const result = await initializeBetaDeployment({
      auditDir,
      configPath: args.config ? String(args.config) : defaultBetaConfigPath(auditDir),
      workspaceName: String(args["workspace-name"] ?? "Parallax Beta Workspace"),
      apiToken: String(args["api-token"]),
      publicBaseUrl: String(args["public-base-url"] ?? "http://127.0.0.1:8787"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, betaInitToHumanReport(result), result);
    return;
  }

  if (command === "beta-readiness") {
    const auditDir = String(args["audit-dir"] ?? "audits");
    const result = await betaDeploymentReadiness({
      auditDir,
      configPath: args.config ? String(args.config) : defaultBetaConfigPath(auditDir),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, betaReadinessToHumanReport(result), result);
    return;
  }

  if (command === "beta-status") {
    const auditDir = String(args["audit-dir"] ?? "audits");
    const result = await betaStatus({
      auditDir,
      configPath: args.config ? String(args.config) : defaultBetaConfigPath(auditDir),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, betaStatusToHumanReport(result), result);
    return;
  }

  if (command === "beta-export") {
    if (!args.out) throw new Error("beta-export requires --out");
    const auditDir = String(args["audit-dir"] ?? "audits");
    const result = await exportBetaDeploymentPackage({
      auditDir,
      configPath: args.config ? String(args.config) : defaultBetaConfigPath(auditDir),
      out: String(args.out)
    });
    printResult(args, betaExportToHumanReport(result), result);
    return;
  }

  if (command === "saas-init") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await initializeManagedSaas({
      rootDir,
      configPath,
      owner: String(args.owner ?? "platform_owner"),
      environment: String(args.environment ?? "managed_beta"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, saasInitToHumanReport(result), result);
    return;
  }

  if (command === "tenant-create") {
    if (!args.slug) throw new Error("tenant-create requires --slug");
    if (!args.name) throw new Error("tenant-create requires --name");
    const { rootDir, configPath } = saasPaths(args);
    const result = await createManagedTenant({
      rootDir,
      configPath,
      slug: String(args.slug),
      name: String(args.name),
      owner: String(args.owner ?? "tenant_owner"),
      plan: String(args.plan ?? "private_beta"),
      region: String(args.region ?? "local_dev"),
      dataResidency: String(args["data-residency"] ?? "local_dev"),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, tenantCreateToHumanReport(result), result);
    return;
  }

  if (command === "secret-ref-add") {
    for (const required of ["name", "scope", "ref"]) {
      if (!args[required]) throw new Error(`secret-ref-add requires --${required}`);
    }
    const { rootDir, configPath } = saasPaths(args);
    const result = await registerSecretReference({
      rootDir,
      configPath,
      name: String(args.name),
      provider: String(args.provider ?? "external_secret_manager"),
      scope: String(args.scope),
      secretRef: String(args.ref),
      owner: String(args.owner ?? "platform_security"),
      rotationDays: args["rotation-days"] && args["rotation-days"] !== true ? Number(args["rotation-days"]) : 90,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, secretRefToHumanReport(result), result);
    return;
  }

  if (command === "integration-add") {
    for (const required of ["kind", "name", "provider"]) {
      if (!args[required]) throw new Error(`integration-add requires --${required}`);
    }
    const { rootDir, configPath } = saasPaths(args);
    const result = await registerExternalIntegration({
      rootDir,
      configPath,
      kind: String(args.kind),
      name: String(args.name),
      provider: String(args.provider),
      status: String(args.status ?? "disabled_until_configured"),
      validationStatus: String(args["validation-status"] ?? "not_validated"),
      tenantSlug: args.tenant ? String(args.tenant) : "",
      secretRef: args["secret-ref"] ? String(args["secret-ref"]) : "",
      dataLicense: args["data-license"] ? String(args["data-license"]) : "",
      endpoint: args.endpoint ? String(args.endpoint) : "",
      notes: args.notes ? String(args.notes) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, externalIntegrationToHumanReport(result), result);
    return;
  }

  if (command === "observability-record") {
    if (!args.type) throw new Error("observability-record requires --type");
    const { rootDir } = saasPaths(args);
    const result = await recordObservabilityEvent({
      rootDir,
      tenantSlug: args.tenant ? String(args.tenant) : "",
      eventType: String(args.type),
      severity: String(args.severity ?? "info"),
      message: args.message ? String(args.message) : "",
      metadata: parseJsonObject(args.metadata),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, observabilityEventToHumanReport(result), result);
    return;
  }

  if (command === "saas-readiness") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await managedSaasReadiness({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, saasReadinessToHumanReport(result), result);
    return;
  }

  if (command === "saas-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await managedSaasStatus({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, saasStatusToHumanReport(result), result);
    return;
  }

  if (command === "saas-export") {
    if (!args.out) throw new Error("saas-export requires --out");
    const { rootDir, configPath } = saasPaths(args);
    const result = await exportManagedSaasPackage({
      rootDir,
      configPath,
      out: String(args.out)
    });
    printResult(args, saasExportToHumanReport(result), result);
    return;
  }

  if (command === "provider-validate") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await validateProviderContracts({
      rootDir,
      configPath,
      out: args.out && args.out !== true ? String(args.out) : providerValidationPath(rootDir),
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, providerValidationToHumanReport(result), result);
    return;
  }

  if (command === "provider-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await validateProviderContracts({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, providerValidationToHumanReport(result), result);
    return;
  }

  if (command === "hosted-console") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await writeHostedConsole({
      rootDir,
      configPath,
      validationPath: providerValidationPath(rootDir),
      out: args.out && args.out !== true ? String(args.out) : undefined,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, hostedConsoleToHumanReport(result), result);
    return;
  }

  if (command === "hosted-api-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await hostedApiStatus({
      rootDir,
      configPath,
      apiTokenHash: args["api-token"] && args["api-token"] !== true ? hostedApiTokenHash(String(args["api-token"])) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, hostedApiStatusToHumanReport(result), result);
    return;
  }

  if (command === "hosted-foundation-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await hostedFoundationStatus({
      rootDir,
      configPath,
      apiTokenHash: args["api-token"] && args["api-token"] !== true ? hostedApiTokenHash(String(args["api-token"])) : "",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, hostedFoundationStatusToHumanReport(result), result);
    return;
  }

  if (command === "tenant-persistence") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await tenantPersistenceStatus({
      rootDir,
      configPath,
      tenantSlug: args.tenant && args.tenant !== true ? String(args.tenant) : undefined,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, tenantPersistenceToHumanReport(result), result);
    return;
  }

  if (command === "identity-init") {
    const { rootDir } = saasPaths(args);
    const result = await initializeIdentityDirectory({
      rootDir,
      issuer: args.issuer ? String(args.issuer) : "parallax-local-identity",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, identityStatusToHumanReport(await identityStatus({
      rootDir,
      now: args.now ? String(args.now) : undefined
    })), result);
    return;
  }

  if (command === "identity-principal-add") {
    if (!args.email) throw new Error("identity-principal-add requires --email");
    const { rootDir, configPath } = saasPaths(args);
    const result = await registerIdentityPrincipal({
      rootDir,
      configPath,
      email: String(args.email),
      name: args.name ? String(args.name) : "",
      tenantSlug: args.tenant ? String(args.tenant) : "",
      role: args.role ? String(args.role) : "analyst",
      scopes: parseCsvList(args.scopes),
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, identityStatusToHumanReport(await identityStatus({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    })), result);
    return;
  }

  if (command === "identity-session-issue") {
    if (!args.email) throw new Error("identity-session-issue requires --email");
    const { rootDir } = saasPaths(args);
    const result = await issueIdentitySession({
      rootDir,
      email: String(args.email),
      tenantSlug: args.tenant ? String(args.tenant) : "",
      ttlMinutes: args["ttl-minutes"] && args["ttl-minutes"] !== true ? Number(args["ttl-minutes"]) : undefined,
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, identitySessionToHumanReport(result), result);
    return;
  }

  if (command === "identity-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await identityStatus({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, identityStatusToHumanReport(result), result);
    return;
  }

  if (command === "storage-init") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await initializeDurableStorage({
      rootDir,
      configPath,
      provider: args.provider ? String(args.provider) : "local_durable_storage",
      region: args.region ? String(args.region) : "local_dev",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, durableStorageStatusToHumanReport(await durableStorageStatus({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    })), result);
    return;
  }

  if (command === "storage-object-put") {
    for (const required of ["tenant", "key", "value"]) {
      if (!args[required]) throw new Error(`storage-object-put requires --${required}`);
    }
    const { rootDir, configPath } = saasPaths(args);
    const result = await writeDurableObject({
      rootDir,
      configPath,
      tenantSlug: String(args.tenant),
      key: String(args.key),
      value: parseJsonValue(args.value),
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, durableObjectToHumanReport(result), result);
    return;
  }

  if (command === "storage-checkpoint") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await createStorageCheckpoint({
      rootDir,
      configPath,
      tenantSlug: args.tenant ? String(args.tenant) : undefined,
      label: args.label ? String(args.label) : "cli_checkpoint",
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, storageCheckpointToHumanReport(result), result);
    return;
  }

  if (command === "storage-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await durableStorageStatus({
      rootDir,
      configPath,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, durableStorageStatusToHumanReport(result), result);
    return;
  }

  if (command === "data-vendor-register") {
    for (const required of ["tenant", "adapter", "name", "provider", "secret-ref", "data-license"]) {
      if (!args[required]) throw new Error(`data-vendor-register requires --${required}`);
    }
    const { rootDir, configPath } = saasPaths(args);
    const result = await registerDataVendorAdapter({
      rootDir,
      configPath,
      tenantSlug: String(args.tenant),
      adapterId: String(args.adapter),
      name: String(args.name),
      provider: String(args.provider),
      secretRef: String(args["secret-ref"]),
      endpoint: args.endpoint ? String(args.endpoint) : "",
      dataLicense: String(args["data-license"]),
      allowedSymbols: parseCsvList(args["allowed-symbols"]) ?? [],
      maxStalenessMinutes: args["max-staleness-minutes"] && args["max-staleness-minutes"] !== true ? Number(args["max-staleness-minutes"]) : 1440,
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, dataVendorAdapterToHumanReport(result), result);
    return;
  }

  if (command === "data-vendor-import") {
    for (const required of ["tenant", "adapter", "symbol", "source-dir"]) {
      if (!args[required]) throw new Error(`data-vendor-import requires --${required}`);
    }
    const { rootDir, configPath } = saasPaths(args);
    const result = await importDataVendorPack({
      rootDir,
      configPath,
      tenantSlug: String(args.tenant),
      adapterId: String(args.adapter),
      symbol: String(args.symbol),
      sourceDataDir: String(args["source-dir"]),
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, dataVendorImportToHumanReport(result), result);
    return;
  }

  if (command === "data-vendor-status") {
    const { rootDir, configPath } = saasPaths(args);
    const result = await dataVendorStatus({
      rootDir,
      configPath,
      tenantSlug: args.tenant ? String(args.tenant) : undefined,
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, dataVendorStatusToHumanReport(result), result);
    return;
  }

  if (command === "tenant-state-set") {
    for (const required of ["tenant", "key", "value"]) {
      if (!args[required]) throw new Error(`tenant-state-set requires --${required}`);
    }
    const { rootDir, configPath } = saasPaths(args);
    const result = await saveTenantStateValue({
      rootDir,
      configPath,
      tenantSlug: String(args.tenant),
      key: String(args.key),
      value: parseJsonValue(args.value),
      actor: args.actor ? String(args.actor) : "cli",
      now: args.now ? String(args.now) : undefined
    });
    printResult(args, tenantPersistenceToHumanReport(await tenantPersistenceStatus({
      rootDir,
      configPath,
      tenantSlug: String(args.tenant),
      now: args.now ? String(args.now) : undefined
    })), result);
    return;
  }

  if (command === "hosted-serve") {
    if (!args["api-token"]) throw new Error("hosted-serve requires --api-token");
    const { rootDir, configPath } = saasPaths(args);
    const started = await startHostedServer({
      rootDir,
      configPath,
      dataDir: String(args["data-dir"] ?? "fixtures"),
      apiToken: String(args["api-token"]),
      host: String(args.host ?? "127.0.0.1"),
      port: args.port && args.port !== true ? Number(args.port) : 8888
    });
    console.log(hostedServeToHumanReport(started));
    process.on("SIGINT", async () => {
      await started.close();
      process.exit(0);
    });
    return;
  }

  if (command === "beta-serve") {
    const auditDir = String(args["audit-dir"] ?? "audits");
    const started = await startBetaServer({
      auditDir,
      configPath: args.config ? String(args.config) : defaultBetaConfigPath(auditDir),
      dataDir: String(args["data-dir"] ?? "fixtures"),
      host: String(args.host ?? "127.0.0.1"),
      port: args.port && args.port !== true ? Number(args.port) : 8787
    });
    console.log(betaServeToHumanReport(started));
    process.on("SIGINT", async () => {
      await started.close();
      process.exit(0);
    });
    return;
  }

  if (command === "sandbox-submit") {
    if (!args.audit) throw new Error("sandbox-submit requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const ticket = createPaperTicket(bundle.dossier);
    const approvals = new ApprovalStore();
    approvals.approve(ticket, { approver: String(args.approver ?? "human") });
    const broker = new SandboxBroker({ approvalStore: approvals, killSwitch: new KillSwitch() });
    const submitted = broker.submit({ dossier: bundle.dossier, ticket });
    printResult(args, sandboxToHumanReport(submitted), submitted);
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
