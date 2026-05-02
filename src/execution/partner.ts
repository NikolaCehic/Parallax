import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { readAuditBundle } from "../audit.js";
import { isoNow, makeId } from "../core/ids.js";
import { createPaperTicket } from "../paper/trading.js";
import { buildGovernanceReport } from "../team/governance.js";
import { KillSwitch, preTradeControls } from "./sandbox.js";

export const PARTNER_EXECUTION_FILE = "partner-execution.json";

const PRODUCT_BOUNDARY =
  "Partner execution is disabled by default. Parallax can create auditable partner handoff records only after legal, compliance, market-access, team-release, human-approval, pre-trade, and kill-switch controls pass.";

const REGULATORY_OBLIGATIONS = [
  {
    id: "broker_dealer_registration",
    source: "SEC broker-dealer registration guidance",
    url: "https://www.sec.gov/divisions/marketreg/bdguide.htm",
    control: "Production routing requires a registered/regulated execution partner; Parallax is not a broker."
  },
  {
    id: "market_access_controls",
    source: "SEC Rule 15c3-5 market access controls",
    url: "https://www.sec.gov/rules-regulations/2011/06/risk-management-controls-brokers-or-dealers-market-access",
    control: "Partner handoff requires documented financial and regulatory risk controls before any market-access route."
  },
  {
    id: "supervisory_system",
    source: "FINRA Rule 3110 supervision",
    url: "https://www.finra.org/finramanual/rules/r3110/",
    control: "Review assignments, approvals, and supervisory decisions must be reconstructable."
  },
  {
    id: "books_records",
    source: "Broker-dealer books and records rules",
    url: "https://www.finra.org/rules-guidance/key-topics/books-records",
    control: "Tickets, approvals, submissions, and post-trade reviews are retained in the local execution ledger."
  }
] as const;

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

function ledgerPath(auditDir: string) {
  return path.join(auditDir, PARTNER_EXECUTION_FILE);
}

function defaultLedger(auditDir: string) {
  return {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    created_at: isoNow(),
    product_boundary: PRODUCT_BOUNDARY,
    live_execution_default: "disabled",
    production_adapter_default: "locked",
    regulatory_obligations: REGULATORY_OBLIGATIONS,
    kill_switch: {
      enabled: false,
      reason: ""
    },
    partners: [],
    legal_approvals: [],
    market_access_reviews: [],
    tickets: [],
    human_approvals: [],
    submissions: [],
    post_trade_reviews: []
  };
}

export async function loadPartnerExecutionLedger(auditDir = "audits") {
  const ledger = await readJsonIfExists(ledgerPath(auditDir), defaultLedger(auditDir));
  return {
    ...defaultLedger(auditDir),
    ...ledger,
    audit_dir: auditDir,
    product_boundary: PRODUCT_BOUNDARY,
    regulatory_obligations: REGULATORY_OBLIGATIONS,
    partners: ledger.partners ?? [],
    legal_approvals: ledger.legal_approvals ?? [],
    market_access_reviews: ledger.market_access_reviews ?? [],
    tickets: ledger.tickets ?? [],
    human_approvals: ledger.human_approvals ?? [],
    submissions: ledger.submissions ?? [],
    post_trade_reviews: ledger.post_trade_reviews ?? [],
    kill_switch: ledger.kill_switch ?? { enabled: false, reason: "" }
  };
}

export async function savePartnerExecutionLedger(auditDir: string, ledger: any) {
  const next = {
    ...ledger,
    schema_version: "0.1.0",
    audit_dir: auditDir,
    updated_at: isoNow(),
    product_boundary: PRODUCT_BOUNDARY,
    regulatory_obligations: REGULATORY_OBLIGATIONS
  };
  await writeJson(ledgerPath(auditDir), next);
  return next;
}

function findPartner(ledger: any, partnerId: string) {
  return (ledger.partners ?? []).find((partner: any) =>
    partner.partner_id === partnerId && partner.status === "active"
  );
}

function isValidAt(record: any, now: string) {
  if (!record) return false;
  if (record.decision && record.decision !== "approved") return false;
  if (record.status && !["approved", "active"].includes(record.status)) return false;
  if (!record.expires_at) return true;
  return new Date(now).getTime() <= new Date(record.expires_at).getTime();
}

function latestValidLegalApproval(ledger: any, partnerId: string, environment: string, now: string) {
  return [...(ledger.legal_approvals ?? [])]
    .filter((approval: any) =>
      approval.partner_id === partnerId &&
      (approval.scope === environment || approval.scope === "all") &&
      isValidAt(approval, now)
    )
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

function latestValidMarketReview(ledger: any, partnerId: string, environment: string, now: string) {
  return [...(ledger.market_access_reviews ?? [])]
    .filter((review: any) =>
      review.partner_id === partnerId &&
      (review.environment === environment || review.environment === "all") &&
      isValidAt(review, now)
    )
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))[0];
}

function latestValidHumanApproval(ledger: any, ticketId: string, now: string) {
  return [...(ledger.human_approvals ?? [])]
    .filter((approval: any) => approval.ticket_id === ticketId && isValidAt(approval, now))
    .sort((a: any, b: any) => String(b.approved_at).localeCompare(String(a.approved_at)))[0];
}

function submittedNotionalForDay(ledger: any, partnerId: string, now: string) {
  const day = now.slice(0, 10);
  return Number((ledger.submissions ?? [])
    .filter((submission: any) =>
      submission.partner_id === partnerId &&
      String(submission.submitted_at).slice(0, 10) === day &&
      !["cancelled", "reversed"].includes(submission.status)
    )
    .reduce((sum: number, submission: any) => sum + (submission.notional ?? 0), 0)
    .toFixed(2));
}

function marketAccessProblems({
  ledger,
  review,
  ticket,
  now
}: {
  ledger: any;
  review: any;
  ticket: any;
  now: string;
}) {
  const problems = [];
  if (!review) {
    problems.push("No valid market access review.");
    return problems;
  }
  if (review.allowed_symbols?.length && !review.allowed_symbols.includes(ticket.symbol)) {
    problems.push(`Symbol ${ticket.symbol} is not allowed by market access review.`);
  }
  if (review.restricted_symbols?.includes(ticket.symbol)) {
    problems.push(`Symbol ${ticket.symbol} is restricted by market access review.`);
  }
  if (review.allowed_sides?.length && !review.allowed_sides.includes(ticket.side)) {
    problems.push(`Side ${ticket.side} is not allowed by market access review.`);
  }
  if (ticket.side === "short" && review.shorting_allowed === false) {
    problems.push("Shorting is not allowed by market access review.");
  }
  if (ticket.notional > review.max_order_notional) {
    problems.push(`Ticket notional ${ticket.notional} exceeds max order notional ${review.max_order_notional}.`);
  }
  const daily = submittedNotionalForDay(ledger, ticket.partner_id, now);
  if (daily + ticket.notional > review.max_daily_notional) {
    problems.push(`Daily notional ${daily + ticket.notional} exceeds max daily notional ${review.max_daily_notional}.`);
  }
  return problems;
}

async function governanceControlForTicket(auditDir: string, ticket: any) {
  const report = await buildGovernanceReport(auditDir);
  return report.release_controls.find((control: any) => control.dossier_id === ticket.dossier_id);
}

function createKillSwitch(ledger: any) {
  const killSwitch = new KillSwitch();
  if (ledger.kill_switch?.enabled) killSwitch.activate(ledger.kill_switch.reason);
  return killSwitch;
}

export async function registerExecutionPartner({
  auditDir = "audits",
  partnerId,
  name,
  environment = "sandbox",
  regulated = true,
  productionEnabled = false,
  productionAdapterStatus = "locked",
  now = isoNow()
}: {
  auditDir?: string;
  partnerId: string;
  name: string;
  environment?: string;
  regulated?: boolean;
  productionEnabled?: boolean;
  productionAdapterStatus?: string;
  now?: string;
}) {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const partner = {
    id: makeId("partner", { partnerId, name, environment, regulated }),
    partner_id: partnerId,
    name,
    environment,
    regulated,
    status: "active",
    production_enabled: productionEnabled,
    production_adapter_status: productionEnabled ? productionAdapterStatus : "locked",
    registered_at: now,
    product_boundary: "Parallax does not custody assets, provide broker services, or bypass partner controls."
  };
  const partners = [
    ...ledger.partners.filter((item: any) => item.partner_id !== partnerId),
    partner
  ];
  const next = await savePartnerExecutionLedger(auditDir, { ...ledger, partners });
  return {
    partner,
    ledger_path: ledgerPath(auditDir),
    partner_count: next.partners.length,
    regulatory_obligations: REGULATORY_OBLIGATIONS
  };
}

export async function recordLegalApproval({
  auditDir = "audits",
  partnerId,
  approver,
  authority = "legal_compliance",
  scope = "sandbox",
  decision = "approved",
  memo = "",
  expiresAt = "",
  now = isoNow()
}: {
  auditDir?: string;
  partnerId: string;
  approver: string;
  authority?: string;
  scope?: string;
  decision?: string;
  memo?: string;
  expiresAt?: string;
  now?: string;
}) {
  if (!["approved", "rejected", "changes_requested"].includes(decision)) {
    throw new Error(`Unknown legal approval decision: ${decision}`);
  }
  const ledger = await loadPartnerExecutionLedger(auditDir);
  if (!findPartner(ledger, partnerId)) throw new Error(`Unknown active execution partner ${partnerId}.`);
  const approval = {
    id: makeId("legal", { partnerId, approver, authority, scope, decision, memo, now }),
    partner_id: partnerId,
    approver,
    authority,
    scope,
    decision,
    memo,
    created_at: now,
    expires_at: expiresAt
  };
  const next = await savePartnerExecutionLedger(auditDir, {
    ...ledger,
    legal_approvals: [...ledger.legal_approvals, approval]
  });
  return {
    approval,
    ledger_path: ledgerPath(auditDir),
    legal_approval_count: next.legal_approvals.length
  };
}

export async function recordMarketAccessReview({
  auditDir = "audits",
  partnerId,
  reviewer,
  environment = "sandbox",
  decision = "approved",
  maxOrderNotional = 1000,
  maxDailyNotional = 5000,
  allowedSymbols = [],
  restrictedSymbols = [],
  allowedSides = ["buy"],
  shortingAllowed = false,
  notes = "",
  expiresAt = "",
  now = isoNow()
}: {
  auditDir?: string;
  partnerId: string;
  reviewer: string;
  environment?: string;
  decision?: string;
  maxOrderNotional?: number;
  maxDailyNotional?: number;
  allowedSymbols?: string[];
  restrictedSymbols?: string[];
  allowedSides?: string[];
  shortingAllowed?: boolean;
  notes?: string;
  expiresAt?: string;
  now?: string;
}) {
  if (!["approved", "rejected", "changes_requested"].includes(decision)) {
    throw new Error(`Unknown market access decision: ${decision}`);
  }
  const ledger = await loadPartnerExecutionLedger(auditDir);
  if (!findPartner(ledger, partnerId)) throw new Error(`Unknown active execution partner ${partnerId}.`);
  const review = {
    id: makeId("market_access", {
      partnerId,
      reviewer,
      environment,
      decision,
      maxOrderNotional,
      maxDailyNotional,
      allowedSymbols,
      restrictedSymbols,
      allowedSides,
      now
    }),
    partner_id: partnerId,
    reviewer,
    environment,
    decision,
    max_order_notional: maxOrderNotional,
    max_daily_notional: maxDailyNotional,
    allowed_symbols: allowedSymbols.map((symbol) => symbol.toUpperCase()),
    restricted_symbols: restrictedSymbols.map((symbol) => symbol.toUpperCase()),
    allowed_sides: allowedSides,
    shorting_allowed: shortingAllowed,
    notes,
    created_at: now,
    expires_at: expiresAt
  };
  const next = await savePartnerExecutionLedger(auditDir, {
    ...ledger,
    market_access_reviews: [...ledger.market_access_reviews, review]
  });
  return {
    review,
    ledger_path: ledgerPath(auditDir),
    market_access_review_count: next.market_access_reviews.length
  };
}

export async function createPartnerOrderTicket({
  auditPath,
  auditDir = path.dirname(auditPath),
  partnerId,
  environment = "sandbox",
  side = "buy",
  riskBudgetPct,
  orderType = "market",
  timeInForce = "day",
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  partnerId: string;
  environment?: string;
  side?: string;
  riskBudgetPct?: number;
  orderType?: string;
  timeInForce?: string;
  now?: string;
}) {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const partner = findPartner(ledger, partnerId);
  if (!partner) throw new Error(`Unknown active execution partner ${partnerId}.`);
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const baseTicket = createPaperTicket(dossier, { side, riskBudgetPct, now });
  const ticketBody = {
    source_ticket_id: baseTicket.id,
    dossier_id: dossier.id,
    audit_path: auditPath,
    partner_id: partnerId,
    partner_name: partner.name,
    environment,
    symbol: baseTicket.symbol,
    side: baseTicket.side,
    quantity: baseTicket.quantity,
    reference_price: baseTicket.reference_price,
    notional: baseTicket.notional,
    order_type: orderType,
    time_in_force: timeInForce,
    status: "created",
    created_at: now,
    production_adapter_locked: environment === "production" && !partner.production_enabled,
    live_execution_intent: environment === "production",
    product_boundary: PRODUCT_BOUNDARY
  };
  const ticket = {
    id: makeId("partner_ticket", ticketBody),
    ...ticketBody
  };
  const next = await savePartnerExecutionLedger(auditDir, {
    ...ledger,
    tickets: [...ledger.tickets, ticket]
  });
  return {
    ticket,
    ledger_path: ledgerPath(auditDir),
    ticket_count: next.tickets.length
  };
}

export async function approvePartnerOrder({
  auditDir = "audits",
  ticketId,
  approver,
  rationale = "",
  expiresAt,
  now = isoNow()
}: {
  auditDir?: string;
  ticketId: string;
  approver: string;
  rationale?: string;
  expiresAt?: string;
  now?: string;
}) {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const ticket = ledger.tickets.find((item: any) => item.id === ticketId);
  if (!ticket) throw new Error(`Unknown partner ticket ${ticketId}.`);
  const approval = {
    id: makeId("partner_human", { ticketId, approver, rationale, now }),
    ticket_id: ticketId,
    dossier_id: ticket.dossier_id,
    partner_id: ticket.partner_id,
    approver,
    rationale,
    decision: "approved",
    approved_at: now,
    expires_at: expiresAt ?? new Date(new Date(now).getTime() + 15 * 60 * 1000).toISOString()
  };
  const next = await savePartnerExecutionLedger(auditDir, {
    ...ledger,
    tickets: ledger.tickets.map((item: any) =>
      item.id === ticketId ? { ...item, status: "approved", human_approval_id: approval.id } : item
    ),
    human_approvals: [...ledger.human_approvals, approval]
  });
  return {
    approval,
    ticket: next.tickets.find((item: any) => item.id === ticketId),
    ledger_path: ledgerPath(auditDir)
  };
}

export async function updatePartnerKillSwitch({
  auditDir = "audits",
  enabled,
  reason = "manual",
  now = isoNow()
}: {
  auditDir?: string;
  enabled: boolean;
  reason?: string;
  now?: string;
}) {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const killSwitch = {
    enabled,
    reason: enabled ? reason : "",
    updated_at: now
  };
  await savePartnerExecutionLedger(auditDir, { ...ledger, kill_switch: killSwitch });
  return {
    kill_switch: killSwitch,
    ledger_path: ledgerPath(auditDir)
  };
}

export async function evaluatePartnerOrderControls({
  auditDir = "audits",
  ticketId,
  now = isoNow()
}: {
  auditDir?: string;
  ticketId: string;
  now?: string;
}) {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const ticket = ledger.tickets.find((item: any) => item.id === ticketId);
  if (!ticket) throw new Error(`Unknown partner ticket ${ticketId}.`);
  const partner = findPartner(ledger, ticket.partner_id);
  const bundle = await readAuditBundle(ticket.audit_path);
  const dossier = bundle.dossier;
  const problems = [];
  const controls: any[] = [];
  const killSwitch = createKillSwitch(ledger);

  if (!partner) {
    problems.push(`Partner ${ticket.partner_id} is not active.`);
  } else {
    if (!partner.regulated) problems.push(`Partner ${ticket.partner_id} is not marked regulated.`);
    controls.push({
      id: "regulated_partner",
      passed: partner.regulated === true,
      detail: partner.name
    });
  }

  if (killSwitch.enabled) {
    problems.push(`Kill switch active: ${killSwitch.reason}`);
  }
  controls.push({
    id: "kill_switch",
    passed: !killSwitch.enabled,
    detail: killSwitch.reason || "inactive"
  });

  const legalApproval = latestValidLegalApproval(ledger, ticket.partner_id, ticket.environment, now);
  if (!legalApproval) problems.push("No valid legal/compliance approval.");
  controls.push({
    id: "legal_compliance_approval",
    passed: Boolean(legalApproval),
    ref: legalApproval?.id ?? null
  });

  const governanceControl = await governanceControlForTicket(auditDir, ticket);
  if (!governanceControl?.release_ready) problems.push("Dossier is not team-release-ready.");
  controls.push({
    id: "team_release_control",
    passed: governanceControl?.release_ready === true,
    ref: governanceControl?.dossier_id ?? ticket.dossier_id,
    missing_review_types: governanceControl?.missing_review_types ?? []
  });

  const marketReview = latestValidMarketReview(ledger, ticket.partner_id, ticket.environment, now);
  const marketProblems = marketAccessProblems({ ledger, review: marketReview, ticket, now });
  problems.push(...marketProblems);
  controls.push({
    id: "market_access_review",
    passed: marketProblems.length === 0,
    ref: marketReview?.id ?? null,
    problems: marketProblems
  });

  const humanApproval = latestValidHumanApproval(ledger, ticketId, now);
  if (!humanApproval) problems.push("No valid human approval.");
  controls.push({
    id: "human_approval",
    passed: Boolean(humanApproval),
    ref: humanApproval?.id ?? null
  });

  const preTrade = preTradeControls({ dossier, ticket: { ...ticket, status: ticket.status === "approved" ? "approved" : "created" }, now });
  if (!preTrade.passed) problems.push(...preTrade.problems);
  controls.push({
    id: "pre_trade_controls",
    passed: preTrade.passed,
    problems: preTrade.problems
  });

  if (ticket.environment === "production") {
    if (!partner?.production_enabled || partner.production_adapter_status !== "enabled_by_compliance") {
      problems.push("Production adapter is locked until a regulated partner production adapter is explicitly enabled by compliance.");
    }
    controls.push({
      id: "production_adapter",
      passed: partner?.production_enabled === true && partner?.production_adapter_status === "enabled_by_compliance",
      detail: partner?.production_adapter_status ?? "missing"
    });
  } else {
    controls.push({
      id: "sandbox_adapter",
      passed: true,
      detail: "partner sandbox handoff only"
    });
  }

  return {
    ticket_id: ticketId,
    dossier_id: ticket.dossier_id,
    partner_id: ticket.partner_id,
    environment: ticket.environment,
    evaluated_at: now,
    passed: problems.length === 0,
    problems,
    controls
  };
}

export async function submitPartnerOrder({
  auditDir = "audits",
  ticketId,
  now = isoNow()
}: {
  auditDir?: string;
  ticketId: string;
  now?: string;
}) {
  const controls = await evaluatePartnerOrderControls({ auditDir, ticketId, now });
  if (!controls.passed) {
    throw new Error(`Partner execution controls failed: ${controls.problems.join(" ")}`);
  }
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const ticket = ledger.tickets.find((item: any) => item.id === ticketId);
  const humanApproval = latestValidHumanApproval(ledger, ticketId, now);
  const legalApproval = latestValidLegalApproval(ledger, ticket.partner_id, ticket.environment, now);
  const marketReview = latestValidMarketReview(ledger, ticket.partner_id, ticket.environment, now);
  const status = ticket.environment === "production"
    ? "submitted_to_regulated_partner"
    : "submitted_to_partner_sandbox";
  const submission = {
    id: makeId("partner_submission", { ticketId, status, now, humanApproval: humanApproval.id }),
    ticket_id: ticketId,
    dossier_id: ticket.dossier_id,
    audit_path: ticket.audit_path,
    partner_id: ticket.partner_id,
    environment: ticket.environment,
    symbol: ticket.symbol,
    side: ticket.side,
    quantity: ticket.quantity,
    notional: ticket.notional,
    status,
    submitted_at: now,
    human_approval_id: humanApproval.id,
    legal_approval_id: legalApproval.id,
    market_access_review_id: marketReview.id,
    controls,
    reversible: true,
    live_execution: ticket.environment === "production",
    product_boundary: PRODUCT_BOUNDARY
  };
  const next = await savePartnerExecutionLedger(auditDir, {
    ...ledger,
    tickets: ledger.tickets.map((item: any) =>
      item.id === ticketId ? { ...item, status, submission_id: submission.id } : item
    ),
    submissions: [...ledger.submissions, submission]
  });
  return {
    submission,
    ledger_path: ledgerPath(auditDir),
    submission_count: next.submissions.length
  };
}

export async function recordPostTradeReview({
  auditDir = "audits",
  submissionId,
  reviewer,
  outcome = "acceptable",
  notes = "",
  now = isoNow()
}: {
  auditDir?: string;
  submissionId: string;
  reviewer: string;
  outcome?: string;
  notes?: string;
  now?: string;
}) {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const submission = ledger.submissions.find((item: any) => item.id === submissionId);
  if (!submission) throw new Error(`Unknown partner submission ${submissionId}.`);
  const review = {
    id: makeId("post_trade", { submissionId, reviewer, outcome, notes, now }),
    submission_id: submissionId,
    ticket_id: submission.ticket_id,
    dossier_id: submission.dossier_id,
    partner_id: submission.partner_id,
    reviewer,
    outcome,
    notes,
    created_at: now
  };
  const next = await savePartnerExecutionLedger(auditDir, {
    ...ledger,
    post_trade_reviews: [...ledger.post_trade_reviews, review]
  });
  return {
    review,
    ledger_path: ledgerPath(auditDir),
    post_trade_review_count: next.post_trade_reviews.length
  };
}

export async function partnerExecutionReport(auditDir = "audits") {
  const ledger = await loadPartnerExecutionLedger(auditDir);
  const governance = await buildGovernanceReport(auditDir);
  const productionUnlocked = ledger.partners.some((partner: any) =>
    partner.status === "active" &&
    partner.regulated === true &&
    partner.production_enabled === true &&
    partner.production_adapter_status === "enabled_by_compliance"
  );
  return {
    schema_version: "0.1.0",
    generated_at: isoNow(),
    summary: {
      audit_dir: auditDir,
      partner_count: ledger.partners.length,
      legal_approval_count: ledger.legal_approvals.length,
      market_access_review_count: ledger.market_access_reviews.length,
      ticket_count: ledger.tickets.length,
      human_approval_count: ledger.human_approvals.length,
      submission_count: ledger.submissions.length,
      sandbox_submission_count: ledger.submissions.filter((item: any) => item.environment === "sandbox").length,
      production_submission_count: ledger.submissions.filter((item: any) => item.environment === "production").length,
      post_trade_review_count: ledger.post_trade_reviews.length,
      production_unlocked: productionUnlocked,
      kill_switch_enabled: ledger.kill_switch.enabled,
      release_ready_count: governance.summary.release_ready_count,
      product_boundary: PRODUCT_BOUNDARY
    },
    regulatory_obligations: REGULATORY_OBLIGATIONS,
    partners: ledger.partners,
    legal_approvals: ledger.legal_approvals,
    market_access_reviews: ledger.market_access_reviews,
    tickets: ledger.tickets,
    human_approvals: ledger.human_approvals,
    submissions: ledger.submissions,
    post_trade_reviews: ledger.post_trade_reviews,
    governance_summary: governance.summary
  };
}
