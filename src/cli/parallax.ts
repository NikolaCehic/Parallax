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
  dataStatusToHumanReport,
  dossierToHumanReport,
  dossierToMarkdown,
  exportToHumanReport,
  feedbackSummaryToHumanReport,
  feedbackToHumanReport,
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
  promptRegistryToHumanReport,
  replayToHumanReport,
  sandboxToHumanReport,
  sourcesToHumanReport,
  teamApprovalToHumanReport,
  teamAssignmentToHumanReport,
  teamCommentToHumanReport,
  teamGovernanceExportToHumanReport,
  teamGovernanceToHumanReport,
  teamInitToHumanReport,
  teamMemberToHumanReport
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
