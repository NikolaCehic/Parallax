function pct(value: number) {
  return `${(value * 100).toFixed(1)}%`;
}

function titleCaseAction(value: string) {
  return value.replaceAll("_", " ").toUpperCase();
}

function lines(items: string[]) {
  return items.filter((item) => item !== undefined && item !== null).join("\n");
}

function findTool(dossier: any, toolName: string) {
  return dossier.tool_outputs.find((output: any) => output.tool_name === toolName);
}

function bullet(items: string[], empty = "None.") {
  if (!items.length) return empty;
  return items.map((item) => `  - ${item}`).join("\n");
}

function compact(value: any) {
  return value === undefined || value === null || value === "" ? "n/a" : String(value);
}

export function dossierToMarkdown(dossier: any) {
  return `# ${dossier.title}

Generated: ${dossier.created_at}

## Decision

- Action class: ${dossier.decision_packet.action_class}
- Thesis state: ${dossier.lifecycle.state}
- Confidence: ${dossier.decision_packet.confidence}
- Freshness: ${dossier.lifecycle.freshness_score}
- Next trigger: ${dossier.decision_packet.next_review_trigger}

## Thesis

${dossier.thesis}

## Product Boundary

- Status: ${dossier.policy_review?.status ?? "unknown"}
- Effective action ceiling: ${dossier.policy_review?.effective_action_ceiling ?? "unknown"}
- Legal posture: ${dossier.policy_review?.positioning?.legal_posture ?? "Research support only."}

## Council Summary

${dossier.summary.council_summary}

## Council Evaluation

- Provider: ${dossier.council_run?.provider?.id ?? "rule_council_v0"}
- Passed: ${dossier.council_run?.eval_report?.passed !== false}
- Problems: ${dossier.council_run?.eval_report?.problems?.length ?? 0}
- Warnings: ${dossier.council_run?.eval_report?.warnings?.length ?? 0}
- Contexts: ${dossier.council_run?.contexts?.length ?? 0}
- Estimated model cost: ${dossier.council_run?.usage?.estimated_cost_usd ?? "n/a"}

## Strongest Bull Case

${dossier.summary.strongest_bull_case}

## Strongest Bear Case

${dossier.summary.strongest_bear_case}

## Dissent

${dossier.summary.dissent.length ? dossier.summary.dissent.map((item) => `- ${item}`).join("\n") : "None recorded."}

## Vetoes

${dossier.decision_packet.vetoes.length ? dossier.decision_packet.vetoes.map((item) => `- ${item.persona_id ?? item.tool_name}: ${item.reason}`).join("\n") : "None."}

## Invalidators

${dossier.summary.invalidators.map((item) => `- ${item}`).join("\n")}

## Lifecycle Triggers

${dossier.lifecycle.triggers.map((trigger) => `- ${trigger.kind}/${trigger.condition_type}: \`${trigger.condition}\` - ${trigger.human_rationale}`).join("\n")}

## Audit

- Dossier ID: ${dossier.id}
- Evidence snapshot: ${dossier.evidence_snapshot.id}
- Tool outputs: ${dossier.tool_outputs.length}
- Claim packets: ${dossier.claim_packets.length}
`;
}

export function dossierToHumanReport(dossier: any, { auditPath, markdownPath }: any = {}) {
  const returns = findTool(dossier, "return_summary");
  const volatility = findTool(dossier, "volatility_check");
  const liquidity = findTool(dossier, "liquidity_check");
  const exposure = findTool(dossier, "portfolio_exposure_check");
  const dataQuality = findTool(dossier, "data_quality_check");
  const event = findTool(dossier, "event_calendar_check");
  const support = dossier.claim_packets.filter((packet: any) => packet.stance === "support").length;
  const oppose = dossier.claim_packets.filter((packet: any) => packet.stance === "oppose").length;
  const needsData = dossier.claim_packets.filter((packet: any) => packet.stance === "needs_more_data").length;

  return lines([
    "Parallax Analysis",
    "=================",
    "",
    "Input",
    `  Symbol: ${dossier.symbol}`,
    `  Horizon: ${dossier.horizon}`,
    `  Thesis: ${dossier.thesis}`,
    "",
    "Pipeline Steps",
    `  1. Intake: normalized ${dossier.symbol} as a ${dossier.horizon} thesis.`,
    `  2. Evidence snapshot: froze ${dossier.evidence_snapshot.items.length} evidence items as ${dossier.evidence_snapshot.id}.`,
    `  3. Product boundary: ${dossier.policy_review?.status ?? "unknown"} with ceiling ${dossier.policy_review?.effective_action_ceiling ?? "unknown"}.`,
    `  4. Python analytics: generated ${dossier.tool_outputs.length} deterministic tool outputs.`,
    `  5. Council provider: ${dossier.council_run?.provider?.id ?? "rule_council_v0"} produced ${dossier.claim_packets.length} claim packets.`,
    `  6. Council evaluation: ${dossier.council_run?.eval_report?.passed === false ? "failed" : "passed"} with ${(dossier.council_run?.eval_report?.warnings ?? []).length} warnings.`,
    dossier.council_run?.usage
      ? `     LLM budget: ${dossier.council_run.usage.context_tokens} context tokens, estimated $${dossier.council_run.usage.estimated_cost_usd}.`
      : "",
    `  7. Cross-examination: ${dossier.cross_examination.veto_count} vetoes, ${dossier.cross_examination.opposed_personas.length} opposing personas, ${dossier.cross_examination.required_checks.length} required checks.`,
    "  8. Synthesis: preserved strongest bull case, bear case, risks, and invalidators.",
    `  9. Decision gate: ${titleCaseAction(dossier.decision_packet.action_class)} with confidence ${dossier.decision_packet.confidence}.`,
    `  10. Lifecycle: thesis is ${dossier.lifecycle.state} until ${dossier.lifecycle.expires_at}.`,
    `  11. Artifacts: audit, markdown dossier, and local library entry written${auditPath ? ` to ${auditPath}` : ""}.`,
    "",
    "Decision",
    `  Action class: ${titleCaseAction(dossier.decision_packet.action_class)}`,
    `  Thesis state: ${dossier.lifecycle.state}`,
    `  Confidence: ${dossier.decision_packet.confidence}`,
    `  Freshness: ${dossier.lifecycle.freshness_score}`,
    `  Confidence cap: ${dossier.decision_packet.confidence_cap_reason}`,
    `  Next review trigger: ${dossier.decision_packet.next_review_trigger}`,
    "",
    "Product Boundary",
    `  Status: ${dossier.policy_review?.status ?? "unknown"}`,
    `  User class: ${dossier.policy_review?.user_class ?? "unknown"}`,
    `  Intended use: ${dossier.policy_review?.intended_use ?? "unknown"}`,
    `  Effective ceiling: ${dossier.policy_review?.effective_action_ceiling ?? "unknown"}`,
    dossier.policy_review?.controls?.map((control: any) => `  - ${control.status}: ${control.message}`).join("\n") ?? "",
    "",
    "Key Numbers",
    returns ? `  Latest close: ${returns.result.latest_close}` : "",
    returns ? `  1-day return: ${pct(returns.result.one_day_return)}` : "",
    returns ? `  20-period momentum: ${pct(returns.result.momentum_20)}` : "",
    volatility ? `  Annualized volatility: ${pct(volatility.result.annualized_volatility_20)}` : "",
    liquidity ? `  Average volume: ${liquidity.result.average_volume_20.toLocaleString()}` : "",
    exposure ? `  Existing symbol exposure: ${pct(exposure.result.existing_symbol_exposure_pct)}` : "",
    exposure ? `  Concentration breach: ${exposure.result.concentration_breach ? "yes" : "no"}` : "",
    event ? `  Future material events: ${event.result.material_event_count}` : "",
    dataQuality ? `  Data quality: ${dataQuality.status}` : "",
    "",
    "Council Result",
    `  Support: ${support}`,
    `  Oppose: ${oppose}`,
    `  Needs more data: ${needsData}`,
    `  Provider: ${dossier.council_run?.provider?.id ?? "rule_council_v0"}`,
    `  Eval: ${dossier.council_run?.eval_report?.passed === false ? "failed" : "passed"}`,
    dossier.council_run?.usage ? `  Context windows: ${dossier.council_run.contexts.length}` : "",
    dossier.council_run?.usage ? `  Estimated LLM cost: $${dossier.council_run.usage.estimated_cost_usd}` : "",
    dossier.council_run?.eval_report?.context_warning_count ? `  Context warnings: ${dossier.council_run.eval_report.context_warning_count}` : "",
    `  Summary: ${dossier.summary.council_summary}`,
    "",
    "Strongest Bull Case",
    `  ${dossier.summary.strongest_bull_case}`,
    "",
    "Strongest Bear Case",
    `  ${dossier.summary.strongest_bear_case}`,
    "",
    "Vetoes",
    dossier.decision_packet.vetoes.length
      ? dossier.decision_packet.vetoes.map((item: any) => `  - ${item.persona_id ?? item.tool_name}: ${item.reason}`).join("\n")
      : "  None.",
    "",
    "Required Checks",
    bullet(dossier.summary.required_checks),
    "",
    "Lifecycle Triggers",
    dossier.lifecycle.triggers.map((trigger: any) => `  - ${trigger.kind}/${trigger.condition_type}: ${trigger.condition} (${trigger.human_rationale})`).join("\n"),
    "",
    "Outputs",
    `  Dossier ID: ${dossier.id}`,
    auditPath ? `  Audit JSON: ${auditPath}` : "",
    markdownPath ? `  Markdown dossier: ${markdownPath}` : "",
    "",
    "Next Commands",
    auditPath ? `  Replay:  node dist/src/cli/parallax.js replay --audit ${auditPath}` : "",
    auditPath ? `  Monitor: node dist/src/cli/parallax.js monitor --audit ${auditPath} --price <latest_price>` : "",
    dossier.decision_packet.action_class === "paper_trade_candidate" && auditPath
      ? `  Paper:   node dist/src/cli/parallax.js paper --audit ${auditPath}`
      : ""
  ]);
}

export function replayToHumanReport(replay: any) {
  return lines([
    "Parallax Audit Replay",
    "=====================",
    "",
    `Replay status: ${replay.valid ? "valid" : "invalid"}`,
    `Expected hash: ${replay.expected_hash}`,
    `Actual hash:   ${replay.actual_hash}`,
    "",
    "Replayed Decision",
    `  Action class: ${titleCaseAction(replay.decision_packet.action_class)}`,
    `  Thesis state: ${replay.decision_packet.thesis_state}`,
    `  Confidence: ${replay.decision_packet.confidence}`,
    `  Freshness: ${replay.decision_packet.freshness_score}`,
    `  Vetoes: ${replay.decision_packet.vetoes.length}`,
    `  Next trigger: ${replay.decision_packet.next_review_trigger}`
  ]);
}

export function monitorToHumanReport(updated: any) {
  return lines([
    "Parallax Lifecycle Monitor",
    "==========================",
    "",
    `Current state: ${updated.state}`,
    `Freshness: ${updated.freshness_score}`,
    `Checked at: ${updated.last_checked_at}`,
    `Expires at: ${updated.expires_at}`,
    "",
    "Fired Triggers",
    updated.fired_triggers.length
      ? updated.fired_triggers.map((trigger: any) => `  - ${trigger.kind}/${trigger.condition_type}: ${trigger.condition} (${trigger.human_rationale})`).join("\n")
      : "  None.",
    "",
    "Interpretation",
    updated.state === "invalidated"
      ? "  This thesis is no longer actionable until a new analysis is run."
      : updated.state === "stale"
        ? "  This thesis needs revalidation before escalation."
        : "  This thesis remains active under the checked conditions."
  ]);
}

export function paperToHumanReport({ ticket, filled }: any) {
  return lines([
    "Parallax Paper Trade",
    "====================",
    "",
    "Ticket",
    `  ID: ${ticket.id}`,
    `  Symbol: ${ticket.symbol}`,
    `  Side: ${ticket.side}`,
    `  Quantity: ${ticket.quantity}`,
    `  Reference price: ${ticket.reference_price}`,
    `  Notional: ${ticket.notional}`,
    "",
    "Simulated Fill",
    `  Status: ${filled.status}`,
    `  Fill price: ${filled.fill_price}`,
    `  Fill notional: ${filled.fill_notional}`,
    `  Cost model: ${filled.fill_model.type}`,
    `  Spread/slippage bps: ${filled.fill_model.estimated_spread_bps}/${filled.fill_model.estimated_slippage_bps}`
  ]);
}

export function paperOpenToHumanReport(result: any) {
  const trade = result.trade;
  return lines([
    "Parallax Paper Open",
    "===================",
    "",
    `Trade ID: ${trade.id}`,
    `Symbol: ${trade.symbol}`,
    `Side: ${trade.side}`,
    `Status: ${trade.status}`,
    `Quantity: ${trade.ticket.quantity}`,
    `Fill price: ${trade.filled.fill_price}`,
    `Reserved notional: ${trade.reserved_notional}`,
    `Risk cap: ${trade.risk_budget_cap}`,
    `Ledger: ${result.ledger_path}`,
    "",
    "Ledger Summary",
    `  Open: ${result.ledger_summary.open_count}`,
    `  Closed: ${result.ledger_summary.closed_count}`,
    `  Reserved: ${result.ledger_summary.reserved_notional}`,
    `  Realized PnL: ${result.ledger_summary.realized_pnl}`,
    "",
    "Simulation Boundary",
    `  ${result.disclosure}`
  ]);
}

export function paperCloseToHumanReport(result: any) {
  const trade = result.trade;
  return lines([
    "Parallax Paper Close",
    "====================",
    "",
    `Trade ID: ${trade.id}`,
    `Symbol: ${trade.symbol}`,
    `Status: ${trade.status}`,
    `Closed at: ${trade.closed_at}`,
    `Exit price: ${trade.closed.exit_price}`,
    `Realized PnL: ${trade.realized_pnl}`,
    `Realized return: ${pct(trade.realized_return)}`,
    "",
    "Attribution",
    `  Thesis quality: ${trade.attribution.thesis_quality}`,
    `  Timing quality: ${trade.attribution.timing_quality}`,
    `  Sizing quality: ${trade.attribution.sizing_quality}`,
    `  Execution quality: ${trade.attribution.execution_quality}`,
    "",
    "Simulation Boundary",
    `  ${result.disclosure}`
  ]);
}

export function paperReviewToHumanReport(result: any) {
  return lines([
    "Parallax Paper Review",
    "=====================",
    "",
    `Review ID: ${result.review.id}`,
    `Trade ID: ${result.review.trade_id}`,
    `Symbol: ${result.review.symbol}`,
    `Rating: ${result.review.rating}`,
    `Reviewer: ${result.review.reviewer}`,
    `Created at: ${result.review.created_at}`,
    "",
    "Notes",
    `  ${compact(result.review.notes)}`
  ]);
}

export function paperLedgerToHumanReport(report: any) {
  const rows = report.ledger.trades.map((trade: any, index: number) =>
    [
      `${index + 1}. ${trade.symbol}`,
      trade.status,
      trade.side,
      `qty=${trade.ticket.quantity}`,
      `entry=${trade.filled.fill_price}`,
      trade.status === "closed" ? `exit=${trade.closed.exit_price}` : "",
      trade.status === "closed" ? `pnl=${trade.realized_pnl}` : `reserved=${trade.reserved_notional}`,
      trade.id
    ].filter(Boolean).join(" | ")
  );

  return lines([
    "Parallax Paper Ledger",
    "=====================",
    "",
    `Audit dir: ${report.summary.audit_dir}`,
    `Trades: ${report.summary.trade_count}`,
    `Open: ${report.summary.open_count}`,
    `Closed: ${report.summary.closed_count}`,
    `Reviews: ${report.summary.review_count}`,
    `Reserved notional: ${report.summary.reserved_notional}`,
    `Realized PnL: ${report.summary.realized_pnl}`,
    `Win rate: ${pct(report.summary.win_rate)}`,
    `Average return: ${pct(report.summary.average_realized_return)}`,
    `Max drawdown: ${report.summary.max_drawdown}`,
    `Live execution unlocked: ${report.summary.live_execution_unlocked ? "yes" : "no"}`,
    "",
    "Trades",
    rows.length ? rows.join("\n") : "No paper trades.",
    "",
    "Calibration",
    `  Dossiers: ${report.calibration.dossier_count}`,
    `  Paper outcomes: ${report.calibration.paper_outcome_count}`,
    `  Profitable paper rate: ${pct(report.calibration.profitable_paper_rate)}`,
    `  ${report.calibration.note}`,
    "",
    "Simulation Boundary",
    `  ${report.summary.disclosure}`
  ]);
}

export function sandboxToHumanReport(submitted: any) {
  return lines([
    "Parallax Sandbox Submission",
    "===========================",
    "",
    `Status: ${submitted.status}`,
    `Broker: ${submitted.broker}`,
    `Ticket ID: ${submitted.id}`,
    `Approval ID: ${submitted.approval_id}`,
    `Symbol: ${submitted.symbol}`,
    `Side: ${submitted.side}`,
    `Quantity: ${submitted.quantity}`,
    `Submitted at: ${submitted.submitted_at}`,
    "",
    "Safety",
    "  Approval was required.",
    "  Pre-trade controls passed.",
    "  Submission remained sandbox-only."
  ]);
}

export function policyToHumanReport(policy: any) {
  return lines([
    "Parallax Product Boundary",
    "==========================",
    "",
    policy.positioning.public_description,
    "",
    "Legal Posture",
    `  ${policy.positioning.legal_posture}`,
    "",
    "Allowed Action Classes",
    policy.allowed_action_classes.map((action: string) => `  - ${titleCaseAction(action)}`).join("\n"),
    "",
    "Excluded Action Classes",
    policy.excluded_action_classes.map((action: string) => `  - ${titleCaseAction(action)}`).join("\n"),
    "",
    "Disclosures",
    bullet(policy.disclosures),
    "",
    "Prohibited Claims",
    bullet(policy.prohibited_claims)
  ]);
}

export function libraryToHumanReport(library: any, { title = "Parallax Dossier Library" }: any = {}) {
  const rows = library.entries.map((entry: any, index: number) =>
    [
      `${index + 1}. ${entry.symbol}`,
      entry.action_class,
      entry.thesis_state,
      `conf ${entry.confidence}`,
      `fresh ${entry.freshness_score}`,
      `policy ${entry.policy_status}`,
      `council ${entry.council_eval_passed === false ? "failed" : "passed"}`,
      entry.audit_path
    ].join(" | ")
  );

  return lines([
    title,
    "=".repeat(title.length),
    "",
    `Audit dir: ${library.audit_dir}`,
    `Dossiers: ${library.entries.length}`,
    "",
    rows.length ? rows.join("\n") : "No dossiers found.",
    "",
    "Next Commands",
    "  Analyze:   npm run analyze -- --symbol NVDA --thesis \"your thesis\"",
    "  Sources:   node dist/src/cli/parallax.js sources --audit <audit_path>",
    "  Feedback:  node dist/src/cli/parallax.js feedback --audit <audit_path> --rating useful"
  ]);
}

export function sourcesToHumanReport(view: any) {
  return lines([
    "Parallax Source View",
    "====================",
    "",
    `Dossier ID: ${view.dossier_id}`,
    `Symbol: ${view.symbol}`,
    `Evidence snapshot: ${view.evidence_snapshot_id}`,
    `Evidence hash: ${view.evidence_hash}`,
    `Data provider: ${view.data_provider}`,
    `Data license: ${view.data_license}`,
    "",
    "Freshness",
    `  Items: ${view.freshness_summary?.item_count ?? view.sources.length}`,
    `  By kind: ${JSON.stringify(view.freshness_summary?.by_kind ?? {})}`,
    `  By freshness: ${JSON.stringify(view.freshness_summary?.by_freshness ?? {})}`,
    `  By license: ${JSON.stringify(view.freshness_summary?.by_license ?? {})}`,
    "",
    "Evidence",
    view.sources.map((source: any) =>
      [
        `  - ${source.kind}/${source.symbol}`,
        `source=${source.source}`,
        `as_of=${source.as_of}`,
        `freshness=${source.freshness_status}`,
        `license=${source.license}`,
        `hash=${source.hash}`,
        `payload=${JSON.stringify(source.payload_summary ?? {})}`
      ].join(" | ")
    ).join("\n"),
    "",
    "Tool Outputs",
    view.tool_outputs.map((output: any) =>
      `  - ${output.tool_name} | status=${output.status} | hash=${output.result_hash}`
    ).join("\n")
  ]);
}

export function dataStatusToHumanReport(status: any) {
  return lines([
    "Parallax Data Status",
    "====================",
    "",
    `Data dir: ${status.data_dir}`,
    `Symbol: ${status.symbol}`,
    `Snapshot: ${status.snapshot_id}`,
    `Passed: ${status.passed ? "yes" : "no"}`,
    "",
    "Summary",
    `  Items: ${status.item_count}`,
    `  By kind: ${JSON.stringify(status.by_kind)}`,
    `  By freshness: ${JSON.stringify(status.by_freshness)}`,
    `  By license: ${JSON.stringify(status.by_license)}`,
    "",
    "Sources",
    status.sources.map((source: any) =>
      [
        `  - ${source.kind}/${source.symbol}`,
        `source=${source.source}`,
        `as_of=${source.as_of}`,
        `freshness=${source.freshness_status}`,
        `license=${source.license}`,
        `payload=${JSON.stringify(source.payload_summary)}`
      ].join(" | ")
    ).join("\n")
  ]);
}

export function portfolioImportToHumanReport(result: any) {
  return lines([
    "Parallax Portfolio Import",
    "=========================",
    "",
    `Output: ${result.out}`,
    `Account: ${result.account_id}`,
    `Positions: ${result.positions}`,
    `Total equity: ${result.total_equity}`,
    `Restricted symbols: ${result.restricted_symbols}`
  ]);
}

export function feedbackToHumanReport(feedback: any) {
  return lines([
    "Parallax Alpha Feedback",
    "=======================",
    "",
    `Feedback ID: ${feedback.id}`,
    `Dossier ID: ${feedback.dossier_id}`,
    `Rating: ${feedback.rating}`,
    `Reviewer: ${feedback.reviewer}`,
    `Created at: ${feedback.created_at}`,
    "",
    "Notes",
    `  ${compact(feedback.notes)}`
  ]);
}

export function feedbackSummaryToHumanReport(summary: any) {
  const rows = Object.entries(summary.by_rating)
    .map(([rating, count]) => `  - ${rating}: ${count}`)
    .join("\n");
  return lines([
    "Parallax Feedback Summary",
    "=========================",
    "",
    `Audit dir: ${summary.audit_dir}`,
    `Feedback count: ${summary.feedback_count}`,
    "",
    "Ratings",
    rows || "  None.",
    "",
    "Latest Notes",
    summary.latest.length
      ? summary.latest.map((item: any) => `  - ${item.rating} / ${item.dossier_id}: ${compact(item.notes)}`).join("\n")
      : "  None."
  ]);
}

export function exportToHumanReport(result: any) {
  return lines([
    "Parallax Workspace Export",
    "=========================",
    "",
    `Output: ${result.out}`,
    `Dossiers: ${result.dossier_count}`,
    `Source views: ${result.source_view_count}`,
    `Audit bundles: ${result.audit_bundle_count ?? 0}`,
    `Feedback: ${result.feedback_count ?? 0}`,
    `Lifecycle files: ${result.lifecycle_file_count ?? 0}`,
    `Paper files: ${result.paper_file_count ?? 0}`,
    `Governance files: ${result.governance_file_count ?? 0}`,
    `Execution files: ${result.execution_file_count ?? 0}`
  ]);
}

export function importToHumanReport(result: any) {
  return lines([
    "Parallax Workspace Import",
    "=========================",
    "",
    `Input: ${result.input}`,
    `Audit dir: ${result.audit_dir}`,
    `Dossiers: ${result.dossier_count}`,
    `Feedback: ${result.feedback_count}`,
    `Lifecycle files: ${result.lifecycle_file_count ?? 0}`,
    `Paper files: ${result.paper_file_count ?? 0}`,
    `Governance files: ${result.governance_file_count ?? 0}`,
    `Execution files: ${result.execution_file_count ?? 0}`
  ]);
}

export function partnerRegisterToHumanReport(result: any) {
  return lines([
    "Parallax Execution Partner",
    "==========================",
    "",
    `Partner ID: ${result.partner.partner_id}`,
    `Name: ${result.partner.name}`,
    `Environment: ${result.partner.environment}`,
    `Regulated: ${result.partner.regulated ? "yes" : "no"}`,
    `Production enabled: ${result.partner.production_enabled ? "yes" : "no"}`,
    `Production adapter: ${result.partner.production_adapter_status}`,
    `Ledger: ${result.ledger_path}`,
    "",
    "Boundary",
    `  ${result.partner.product_boundary}`
  ]);
}

export function partnerLegalApprovalToHumanReport(result: any) {
  const approval = result.approval;
  return lines([
    "Parallax Partner Legal Approval",
    "================================",
    "",
    `Approval ID: ${approval.id}`,
    `Partner ID: ${approval.partner_id}`,
    `Approver: ${approval.approver}`,
    `Authority: ${approval.authority}`,
    `Scope: ${approval.scope}`,
    `Decision: ${approval.decision}`,
    `Expires: ${compact(approval.expires_at)}`,
    "",
    "Memo",
    `  ${compact(approval.memo)}`
  ]);
}

export function partnerMarketReviewToHumanReport(result: any) {
  const review = result.review;
  return lines([
    "Parallax Market Access Review",
    "=============================",
    "",
    `Review ID: ${review.id}`,
    `Partner ID: ${review.partner_id}`,
    `Environment: ${review.environment}`,
    `Reviewer: ${review.reviewer}`,
    `Decision: ${review.decision}`,
    `Max order notional: ${review.max_order_notional}`,
    `Max daily notional: ${review.max_daily_notional}`,
    `Allowed symbols: ${review.allowed_symbols.length ? review.allowed_symbols.join(", ") : "all"}`,
    `Restricted symbols: ${review.restricted_symbols.length ? review.restricted_symbols.join(", ") : "none"}`,
    `Allowed sides: ${review.allowed_sides.join(", ")}`,
    `Shorting allowed: ${review.shorting_allowed ? "yes" : "no"}`,
    "",
    "Notes",
    `  ${compact(review.notes)}`
  ]);
}

export function partnerTicketToHumanReport(result: any) {
  const ticket = result.ticket;
  return lines([
    "Parallax Partner Ticket",
    "=======================",
    "",
    `Ticket ID: ${ticket.id}`,
    `Dossier ID: ${ticket.dossier_id}`,
    `Partner ID: ${ticket.partner_id}`,
    `Environment: ${ticket.environment}`,
    `Symbol: ${ticket.symbol}`,
    `Side: ${ticket.side}`,
    `Quantity: ${ticket.quantity}`,
    `Notional: ${ticket.notional}`,
    `Status: ${ticket.status}`,
    `Production adapter locked: ${ticket.production_adapter_locked ? "yes" : "no"}`,
    "",
    "Boundary",
    `  ${ticket.product_boundary}`
  ]);
}

export function partnerHumanApprovalToHumanReport(result: any) {
  const approval = result.approval;
  return lines([
    "Parallax Partner Human Approval",
    "================================",
    "",
    `Approval ID: ${approval.id}`,
    `Ticket ID: ${approval.ticket_id}`,
    `Partner ID: ${approval.partner_id}`,
    `Approver: ${approval.approver}`,
    `Expires: ${approval.expires_at}`,
    "",
    "Rationale",
    `  ${compact(approval.rationale)}`
  ]);
}

export function partnerControlsToHumanReport(result: any) {
  const rows = result.controls.map((control: any) =>
    [
      `  - ${control.id}`,
      control.passed ? "passed" : "failed",
      control.ref ? `ref=${control.ref}` : "",
      control.detail ? `detail=${control.detail}` : "",
      control.problems?.length ? `problems=${control.problems.join("; ")}` : "",
      control.missing_review_types?.length ? `missing=${control.missing_review_types.join(",")}` : ""
    ].filter(Boolean).join(" | ")
  );
  return lines([
    "Parallax Partner Execution Controls",
    "====================================",
    "",
    `Ticket ID: ${result.ticket_id}`,
    `Partner ID: ${result.partner_id}`,
    `Environment: ${result.environment}`,
    `Passed: ${result.passed ? "yes" : "no"}`,
    "",
    "Problems",
    bullet(result.problems),
    "",
    "Controls",
    rows.join("\n")
  ]);
}

export function partnerSubmitToHumanReport(result: any) {
  const submission = result.submission;
  return lines([
    "Parallax Partner Submission",
    "===========================",
    "",
    `Submission ID: ${submission.id}`,
    `Ticket ID: ${submission.ticket_id}`,
    `Partner ID: ${submission.partner_id}`,
    `Environment: ${submission.environment}`,
    `Status: ${submission.status}`,
    `Symbol: ${submission.symbol}`,
    `Side: ${submission.side}`,
    `Quantity: ${submission.quantity}`,
    `Notional: ${submission.notional}`,
    `Live execution: ${submission.live_execution ? "yes" : "no"}`,
    `Reversible: ${submission.reversible ? "yes" : "no"}`,
    "",
    "Control References",
    `  Human approval: ${submission.human_approval_id}`,
    `  Legal approval: ${submission.legal_approval_id}`,
    `  Market access review: ${submission.market_access_review_id}`,
    "",
    "Boundary",
    `  ${submission.product_boundary}`
  ]);
}

export function partnerPostTradeReviewToHumanReport(result: any) {
  const review = result.review;
  return lines([
    "Parallax Post-Trade Review",
    "==========================",
    "",
    `Review ID: ${review.id}`,
    `Submission ID: ${review.submission_id}`,
    `Partner ID: ${review.partner_id}`,
    `Reviewer: ${review.reviewer}`,
    `Outcome: ${review.outcome}`,
    `Created at: ${review.created_at}`,
    "",
    "Notes",
    `  ${compact(review.notes)}`
  ]);
}

export function partnerReportToHumanReport(report: any) {
  const submissions = report.submissions.map((submission: any, index: number) =>
    [
      `${index + 1}. ${submission.symbol}`,
      submission.environment,
      submission.status,
      `notional=${submission.notional}`,
      `live=${submission.live_execution ? "yes" : "no"}`,
      submission.id
    ].join(" | ")
  );
  const obligations = report.regulatory_obligations.map((item: any) =>
    `  - ${item.id}: ${item.control}`
  );
  return lines([
    "Parallax Partner Execution Report",
    "==================================",
    "",
    `Audit dir: ${report.summary.audit_dir}`,
    `Partners: ${report.summary.partner_count}`,
    `Legal approvals: ${report.summary.legal_approval_count}`,
    `Market access reviews: ${report.summary.market_access_review_count}`,
    `Tickets: ${report.summary.ticket_count}`,
    `Human approvals: ${report.summary.human_approval_count}`,
    `Submissions: ${report.summary.submission_count}`,
    `Sandbox submissions: ${report.summary.sandbox_submission_count}`,
    `Production submissions: ${report.summary.production_submission_count}`,
    `Post-trade reviews: ${report.summary.post_trade_review_count}`,
    `Production unlocked: ${report.summary.production_unlocked ? "yes" : "no"}`,
    `Kill switch enabled: ${report.summary.kill_switch_enabled ? "yes" : "no"}`,
    `Team release ready: ${report.summary.release_ready_count}`,
    "",
    "Submissions",
    submissions.length ? submissions.join("\n") : "No partner submissions.",
    "",
    "Regulatory Control Checklist",
    obligations.join("\n"),
    "",
    "Boundary",
    `  ${report.summary.product_boundary}`
  ]);
}

export function partnerKillSwitchToHumanReport(result: any) {
  return lines([
    "Parallax Partner Kill Switch",
    "============================",
    "",
    `Enabled: ${result.kill_switch.enabled ? "yes" : "no"}`,
    `Reason: ${compact(result.kill_switch.reason)}`,
    `Updated at: ${result.kill_switch.updated_at}`,
    `Ledger: ${result.ledger_path}`
  ]);
}

export function betaInitToHumanReport(result: any) {
  return lines([
    "Parallax Beta Deployment",
    "========================",
    "",
    `Deployment ID: ${result.config.deployment_id}`,
    `Workspace: ${result.config.workspace_name}`,
    `Mode: ${result.config.deployment_mode}`,
    `Base URL: ${result.config.public_base_url}`,
    `Audit dir: ${result.config.audit_dir}`,
    `Config: ${result.config_path}`,
    "",
    "Auth",
    `  Scheme: ${result.config.api.auth_scheme}`,
    `  Raw token stored: ${result.config.api.raw_token_stored ? "yes" : "no"}`,
    "",
    "Boundary",
    `  ${result.disclosure}`
  ]);
}

export function betaReadinessToHumanReport(report: any) {
  const rows = report.controls.map((control: any) =>
    [
      `  - ${control.id}`,
      control.passed ? "passed" : "failed",
      control.severity,
      control.detail
    ].join(" | ")
  );
  return lines([
    "Parallax Beta Readiness",
    "=======================",
    "",
    `Status: ${report.status}`,
    `Workspace: ${report.deployment.workspace_name}`,
    `Mode: ${report.deployment.deployment_mode}`,
    `Audit dir: ${report.deployment.audit_dir}`,
    `Dossiers: ${report.summary.dossier_count}`,
    `Release ready: ${report.summary.release_ready_count}`,
    `Partner submissions: ${report.summary.partner_submission_count}`,
    `Production submissions: ${report.summary.production_submission_count}`,
    `Required failures: ${report.summary.required_failed_count}`,
    `Warnings: ${report.summary.warning_count}`,
    "",
    "Controls",
    rows.join("\n"),
    "",
    "Endpoints",
    report.endpoints.map((endpoint: string) => `  - ${endpoint}`).join("\n")
  ]);
}

export function betaStatusToHumanReport(status: any) {
  return lines([
    "Parallax Beta Status",
    "====================",
    "",
    `Readiness: ${status.readiness.status}`,
    `Dossiers: ${status.library_summary.dossier_count}`,
    `Action classes: ${JSON.stringify(status.library_summary.action_classes)}`,
    `Team release ready: ${status.governance_summary.release_ready_count}`,
    `Partner submissions: ${status.partner_execution_summary.submission_count}`,
    `Production submissions: ${status.partner_execution_summary.production_submission_count}`,
    `Paper trades: ${status.paper_summary.trade_count}`,
    "",
    "Product Boundary",
    `  ${status.product_policy.legal_posture}`
  ]);
}

export function betaExportToHumanReport(result: any) {
  return lines([
    "Parallax Beta Export",
    "====================",
    "",
    `Output: ${result.out}`,
    `Readiness: ${result.readiness_status}`,
    `Workspace export: ${result.workspace_export_path}`,
    `Dossiers: ${result.dossier_count}`,
    `Governance files: ${result.governance_file_count}`,
    `Execution files: ${result.execution_file_count}`
  ]);
}

export function betaServeToHumanReport(result: any) {
  return lines([
    "Parallax Beta Server",
    "====================",
    "",
    `URL: ${result.url}`,
    `Health: ${result.url}/healthz`,
    `Readiness: ${result.url}/readyz`,
    `Dashboard: ${result.url}/dashboard`
  ]);
}

export function saasInitToHumanReport(result: any) {
  const config = result.config;
  return lines([
    "Parallax Managed SaaS Control Plane",
    "===================================",
    "",
    `Control plane: ${config.control_plane_id}`,
    `Environment: ${config.environment}`,
    `Owner: ${config.owner}`,
    `Root dir: ${config.root_dir}`,
    `Config: ${result.config_path}`,
    "",
    "Boundaries",
    `  Cross-tenant queries: ${config.tenancy.cross_tenant_queries_allowed ? "allowed" : "disabled"}`,
    `  Raw secret storage: ${config.secrets.raw_secret_storage_allowed ? "allowed" : "blocked"}`,
    `  Direct broker connection: ${config.production_boundaries.direct_broker_connection ? "allowed" : "blocked"}`
  ]);
}

export function tenantCreateToHumanReport(result: any) {
  const tenant = result.tenant;
  return lines([
    "Parallax Managed Tenant",
    "=======================",
    "",
    `Tenant: ${tenant.name}`,
    `Slug: ${tenant.slug}`,
    `Plan: ${tenant.plan}`,
    `Region: ${tenant.region}`,
    `Data residency: ${tenant.data_residency}`,
    `Audit dir: ${tenant.audit_dir}`,
    `Tenants: ${result.tenant_count}`,
    `Config: ${result.config_path}`
  ]);
}

export function secretRefToHumanReport(result: any) {
  const secret = result.secret;
  return lines([
    "Parallax Secret Reference",
    "=========================",
    "",
    `Name: ${secret.name}`,
    `Provider: ${secret.provider}`,
    `Scope: ${secret.scope}`,
    `Reference hash: ${secret.secret_ref_hash}`,
    `Raw secret stored: ${secret.raw_secret_stored ? "yes" : "no"}`,
    `Rotation days: ${secret.rotation_days}`,
    `Secret refs: ${result.secret_ref_count}`,
    `Config: ${result.config_path}`
  ]);
}

export function externalIntegrationToHumanReport(result: any) {
  const integration = result.integration;
  return lines([
    "Parallax External Integration Manifest",
    "======================================",
    "",
    `Kind: ${integration.kind}`,
    `Name: ${integration.name}`,
    `Provider: ${integration.provider}`,
    `Status: ${integration.status}`,
    `Validation: ${integration.validation_status}`,
    `Tenant: ${compact(integration.tenant_slug)}`,
    `Secret ref: ${compact(integration.secret_ref)}`,
    `Raw secret stored: ${integration.raw_secret_stored ? "yes" : "no"}`,
    `Integrations: ${result.integration_count}`,
    `Config: ${result.config_path}`,
    "",
    "Notes",
    `  ${compact(integration.notes)}`
  ]);
}

export function observabilityEventToHumanReport(result: any) {
  const event = result.event;
  return lines([
    "Parallax Observability Event",
    "============================",
    "",
    `Event ID: ${event.id}`,
    `Type: ${event.event_type}`,
    `Severity: ${event.severity}`,
    `Tenant: ${compact(event.tenant_slug)}`,
    `Created at: ${event.created_at}`,
    `Path: ${result.observability_path}`,
    "",
    "Message",
    `  ${compact(event.message)}`
  ]);
}

export function saasReadinessToHumanReport(report: any) {
  const controlRows = report.controls.map((control: any) =>
    [
      `  - ${control.id}`,
      control.passed ? "passed" : "failed",
      control.severity,
      control.detail
    ].join(" | ")
  );
  const integrationRows = Object.entries(report.summary.integration_kinds).map(([kind, count]) =>
    `  - ${kind}: ${count}`
  );
  return lines([
    "Parallax Managed SaaS Readiness",
    "================================",
    "",
    `Status: ${report.status}`,
    `Root dir: ${report.root_dir}`,
    `Tenants: ${report.summary.tenant_count}`,
    `Secret refs: ${report.summary.secret_ref_count}`,
    `Integrations: ${report.summary.integration_count}`,
    `Observability events: ${report.summary.observability_event_count}`,
    `Required failures: ${report.summary.required_failed_count}`,
    "",
    "Integration Manifests",
    integrationRows.join("\n"),
    "",
    "Controls",
    controlRows.join("\n")
  ]);
}

export function saasStatusToHumanReport(status: any) {
  return lines([
    "Parallax Managed SaaS Status",
    "============================",
    "",
    `Control plane: ${status.control_plane_id}`,
    `Environment: ${status.environment}`,
    `Readiness: ${status.readiness.status}`,
    `Tenants: ${status.readiness.summary.tenant_count}`,
    `Secret refs: ${status.readiness.summary.secret_ref_count}`,
    `Integrations: ${status.readiness.summary.integration_count}`,
    `Observability events: ${status.readiness.summary.observability_event_count}`,
    "",
    "Production Boundary",
    `  Direct broker connection: ${status.production_boundaries.direct_broker_connection ? "allowed" : "blocked"}`,
    `  Partner adapter default: ${status.production_boundaries.production_partner_adapter_default}`
  ]);
}

export function saasExportToHumanReport(result: any) {
  return lines([
    "Parallax Managed SaaS Export",
    "============================",
    "",
    `Output: ${result.out}`,
    `Readiness: ${result.readiness_status}`,
    `Tenants: ${result.tenant_count}`,
    `Secret refs: ${result.secret_ref_count}`,
    `Integrations: ${result.integration_count}`,
    `Observability events: ${result.observability_event_count}`
  ]);
}

export function providerValidationToHumanReport(report: any) {
  const providerRows = report.providers.map((provider: any) =>
    [
      `  - ${provider.kind}`,
      provider.name,
      provider.status,
      `manifest=${provider.manifest_status}`,
      `validation=${provider.validation_status}`,
      `failures=${provider.required_failure_count}`
    ].join(" | ")
  );
  const controlRows = report.controls.map((control: any) =>
    [
      `  - ${control.id}`,
      control.passed ? "passed" : "failed",
      control.severity,
      control.detail
    ].join(" | ")
  );
  return lines([
    "Parallax Provider Validation",
    "============================",
    "",
    `Status: ${report.status}`,
    `Root dir: ${report.root_dir}`,
    `Providers: ${report.summary.provider_count}`,
    `Contract validated: ${report.summary.contract_validated_count}`,
    `Required failures: ${report.summary.required_failure_count}`,
    `Warnings: ${report.summary.warning_count}`,
    `Validation path: ${compact(report.validation_path)}`,
    "",
    "Providers",
    providerRows.length ? providerRows.join("\n") : "No provider manifests.",
    "",
    "Controls",
    controlRows.length ? controlRows.join("\n") : "No controls."
  ]);
}

export function hostedConsoleToHumanReport(result: any) {
  return lines([
    "Parallax Hosted Console",
    "=======================",
    "",
    `Output: ${result.out}`,
    `Root dir: ${result.root_dir}`,
    `Console kind: ${result.console_kind ?? "hosted_console"}`,
    `Provider validation: ${result.validation_path}`,
    `Bytes: ${result.bytes}`,
    `Generated at: ${result.generated_at}`
  ]);
}

export function setupRepairStatusToHumanReport(status: any) {
  const actions = status.actions.map((item: any) =>
    [
      `  - ${item.id}`,
      item.status,
      item.boundary,
      item.can_apply ? "can_apply" : item.block_reason || "no_action",
      item.label
    ].join(" | ")
  );
  return lines([
    "Parallax Guided Connector Repair",
    "=================================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Tenant: ${status.summary.tenant_slug}`,
    `Symbol: ${status.summary.symbol}`,
    `Complete: ${status.summary.complete_count}/${status.summary.action_count}`,
    `Needed: ${status.summary.needed_count}`,
    `Blocked: ${status.summary.blocked_count}`,
    `Raw secret stored: ${status.summary.raw_secret_stored ? "yes" : "no"}`,
    `Direct external network connection: ${status.summary.direct_external_network_connection ? "yes" : "no"}`,
    "",
    "Statuses",
    Object.entries(status.statuses).map(([key, value]) => `  - ${key}: ${value}`).join("\n"),
    "",
    "Next Action",
    status.next_action
      ? `  ${status.next_action.id}: ${status.next_action.label}`
      : "  No repair action needed.",
    "",
    "Actions",
    actions.length ? actions.join("\n") : "No actions."
  ]);
}

export function setupRepairApplyToHumanReport(result: any) {
  return lines([
    "Parallax Guided Repair Applied",
    "==============================",
    "",
    `Action: ${result.action_id}`,
    `Label: ${result.action_label}`,
    `Status: ${result.status}`,
    `Root dir: ${result.root_dir}`,
    `Tenant: ${result.tenant_slug}`,
    `Symbol: ${result.symbol}`,
    `Before: ${result.before_status}`,
    `After: ${result.after_status}`,
    `Next: ${result.next_action?.id ?? "none"}`,
    `Raw secret stored: ${result.raw_secret_stored ? "yes" : "no"}`,
    `Direct external network connection: ${result.direct_external_network_connection ? "yes" : "no"}`
  ]);
}

export function tenantPersistenceToHumanReport(report: any) {
  const tenantRows = report.tenants.map((tenant: any) =>
    [
      `  - ${tenant.tenant_slug}`,
      tenant.status,
      `state_keys=${tenant.state_key_count}`,
      `events=${tenant.event_count}`,
      `dossiers=${tenant.dossier_count}`,
      tenant.audit_dir
    ].join(" | ")
  );
  return lines([
    "Parallax Tenant Persistence",
    "===========================",
    "",
    `Status: ${report.status}`,
    `Root dir: ${report.root_dir}`,
    `Tenants: ${report.summary.tenant_count}`,
    `State keys: ${report.summary.total_state_key_count}`,
    `Events: ${report.summary.total_event_count}`,
    `Dossiers: ${report.summary.total_dossier_count}`,
    `Paths isolated: ${report.summary.tenant_paths_isolated ? "yes" : "no"}`,
    "",
    "Tenants",
    tenantRows.length ? tenantRows.join("\n") : "No tenants."
  ]);
}

export function hostedApiStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    [
      `  - ${control.id}`,
      control.passed ? "passed" : "failed",
      control.severity,
      control.detail
    ].join(" | ")
  );
  return lines([
    "Parallax Hosted API Status",
    "==========================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Tenants: ${status.summary.tenant_count}`,
    `Providers: ${status.summary.provider_count}`,
    `Dossiers: ${status.summary.total_dossier_count}`,
    `Required failures: ${status.summary.required_failure_count}`,
    `Raw token stored: ${status.summary.raw_token_stored ? "yes" : "no"}`,
    `Direct live broker connection: ${status.summary.direct_live_broker_connection ? "yes" : "no"}`,
    "",
    "Controls",
    controls.join("\n")
  ]);
}

export function hostedServeToHumanReport(result: any) {
  return lines([
    "Parallax Hosted API Server",
    "==========================",
    "",
    `URL: ${result.url}`,
    `Health: ${result.url}/healthz`,
    `Readiness: ${result.url}/readyz`,
    `Console: ${result.url}/console`,
    `Root dir: ${result.root_dir}`,
    `Raw token stored: ${result.raw_token_stored ? "yes" : "no"}`
  ]);
}

export function identityStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    `  - ${control.id} | ${control.passed ? "passed" : "failed"} | ${control.detail}`
  );
  const principals = status.principals.map((principal: any) =>
    [
      `  - ${principal.email}`,
      principal.platform_admin ? "platform_admin" : "tenant_user",
      `memberships=${principal.memberships.length}`
    ].join(" | ")
  );
  return lines([
    "Parallax Identity Foundation",
    "============================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Principals: ${status.summary.principal_count}`,
    `Tenant memberships: ${status.summary.tenant_membership_count}`,
    `Sessions: ${status.summary.session_count}`,
    `Active sessions: ${status.summary.active_session_count}`,
    `Raw session token stored: ${status.summary.raw_session_token_stored ? "yes" : "no"}`,
    "",
    "Principals",
    principals.length ? principals.join("\n") : "No principals.",
    "",
    "Controls",
    controls.length ? controls.join("\n") : "No controls."
  ]);
}

export function identitySessionToHumanReport(result: any) {
  return lines([
    "Parallax Identity Session",
    "=========================",
    "",
    `Session ID: ${result.session.id}`,
    `Principal: ${result.session.email}`,
    `Tenant: ${compact(result.session.tenant_slug)}`,
    `Role: ${result.session.role}`,
    `Scopes: ${result.session.scopes.join(", ")}`,
    `Expires at: ${result.session.expires_at}`,
    `Raw session token stored: ${result.raw_session_token_stored ? "yes" : "no"}`,
    "",
    "Session token",
    `  ${result.session_token}`
  ]);
}

export function onboardingStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    `  - ${control.id} | ${control.passed ? "passed" : "failed"} | ${control.detail}`
  );
  const invitations = status.invitations.map((invitation: any) =>
    [
      `  - ${invitation.email}`,
      invitation.status,
      invitation.tenant_slug,
      invitation.role,
      `expires=${invitation.expires_at}`
    ].join(" | ")
  );
  return lines([
    "Parallax Workspace Onboarding",
    "=============================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Invitations: ${status.summary.invite_count}`,
    `Pending: ${status.summary.pending_count}`,
    `Accepted: ${status.summary.accepted_count}`,
    `Expired: ${status.summary.expired_count}`,
    `Revoked: ${status.summary.revoked_count}`,
    `Principals: ${status.summary.principal_count}`,
    `Active sessions: ${status.summary.active_session_count}`,
    `Raw invite token stored: ${status.summary.raw_invite_token_stored ? "yes" : "no"}`,
    `Raw session token stored: ${status.summary.raw_session_token_stored ? "yes" : "no"}`,
    "",
    "Invitations",
    invitations.length ? invitations.join("\n") : "No invitations.",
    "",
    "Controls",
    controls.length ? controls.join("\n") : "No controls."
  ]);
}

export function inviteCreateToHumanReport(result: any) {
  return lines([
    "Parallax Workspace Invitation",
    "=============================",
    "",
    `Invitation ID: ${result.invitation.id}`,
    `Email: ${result.invitation.email}`,
    `Tenant: ${result.invitation.tenant_slug}`,
    `Role: ${result.invitation.role}`,
    `Status: ${result.invitation.status}`,
    `Expires at: ${result.invitation.expires_at}`,
    `Raw invite token stored: ${result.raw_invite_token_stored ? "yes" : "no"}`,
    `Raw session token stored: ${result.raw_session_token_stored ? "yes" : "no"}`,
    "",
    "Invite token",
    `  ${result.invite_token}`
  ]);
}

export function inviteAcceptToHumanReport(result: any) {
  return lines([
    "Parallax Workspace Invite Accepted",
    "==================================",
    "",
    `Invitation ID: ${result.invitation.id}`,
    `Principal: ${result.principal.email}`,
    `Tenant: ${result.invitation.tenant_slug}`,
    `Role: ${result.invitation.role}`,
    `Session ID: ${result.session.id}`,
    `Expires at: ${result.session.expires_at}`,
    `Raw invite token stored: ${result.raw_invite_token_stored ? "yes" : "no"}`,
    `Raw session token stored: ${result.raw_session_token_stored ? "yes" : "no"}`,
    "",
    "Session token",
    `  ${result.session_token}`
  ]);
}

export function accountProfileToHumanReport(result: any) {
  const memberships = (result.profile.memberships ?? []).map((membership: any) =>
    [
      `  - ${membership.tenant_slug}`,
      membership.role,
      `scopes=${(membership.scopes ?? []).join(",")}`
    ].join(" | ")
  );
  return lines([
    "Parallax Account",
    "================",
    "",
    `Status: ${result.status}`,
    `Email: ${result.profile.email}`,
    `Name: ${result.profile.name}`,
    `Active tenant: ${compact(result.session.tenant_slug)}`,
    `Active role: ${result.session.role}`,
    `Session expires: ${result.session.expires_at}`,
    `Raw session token stored: ${result.raw_session_token_stored ? "yes" : "no"}`,
    "",
    "Memberships",
    memberships.length ? memberships.join("\n") : "No memberships."
  ]);
}

export function accountProfileUpdateToHumanReport(result: any) {
  return lines([
    "Parallax Account Updated",
    "========================",
    "",
    `Status: ${result.status}`,
    `Email: ${result.profile.email}`,
    `Name: ${result.profile.name}`,
    `Default tenant: ${compact(result.profile.preferences?.default_tenant_slug)}`,
    `Raw session token stored: ${result.raw_session_token_stored ? "yes" : "no"}`
  ]);
}

export function membershipRoleToHumanReport(result: any) {
  return lines([
    "Parallax Membership Role",
    "========================",
    "",
    `Status: ${result.status}`,
    `Principal: ${result.principal.email}`,
    `Tenant: ${result.membership.tenant_slug}`,
    `Role: ${result.membership.role}`,
    `Scopes: ${result.membership.scopes.join(", ")}`,
    `Updated sessions: ${result.updated_session_count}`,
    `Raw session token stored: ${result.raw_session_token_stored ? "yes" : "no"}`
  ]);
}

export function durableStorageStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    `  - ${control.id} | ${control.passed ? "passed" : "failed"} | ${control.detail}`
  );
  const objects = status.objects.map((object: any) =>
    [
      `  - ${object.tenant_slug}/${object.key}`,
      object.value_hash,
      object.path
    ].join(" | ")
  );
  return lines([
    "Parallax Durable Storage",
    "========================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Storage root: ${status.storage.storage_root}`,
    `Provider: ${status.storage.provider}`,
    `Objects: ${status.summary.object_count}`,
    `Checkpoints: ${status.summary.checkpoint_count}`,
    `Raw secret stored: ${status.summary.raw_secret_stored ? "yes" : "no"}`,
    `Direct cloud storage connection: ${status.summary.direct_cloud_storage_connection ? "yes" : "no"}`,
    "",
    "Objects",
    objects.length ? objects.join("\n") : "No durable objects.",
    "",
    "Controls",
    controls.length ? controls.join("\n") : "No controls."
  ]);
}

export function durableObjectToHumanReport(result: any) {
  return lines([
    "Parallax Durable Object",
    "=======================",
    "",
    `Tenant: ${result.object.tenant_slug}`,
    `Key: ${result.object.key}`,
    `Hash: ${result.object.value_hash}`,
    `Path: ${result.object_path}`,
    `Objects: ${result.object_count}`
  ]);
}

export function storageCheckpointToHumanReport(result: any) {
  return lines([
    "Parallax Storage Checkpoint",
    "===========================",
    "",
    `Checkpoint ID: ${result.checkpoint.id}`,
    `Label: ${result.checkpoint.label}`,
    `Tenant: ${compact(result.checkpoint.tenant_slug)}`,
    `Objects: ${result.checkpoint.object_count}`,
    `Dossiers: ${result.checkpoint.dossier_count}`,
    `Path: ${result.checkpoint_path}`,
    `Checkpoints: ${result.checkpoint_count}`
  ]);
}

export function hostedFoundationStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    `  - ${control.id} | ${control.passed ? "passed" : "failed"} | ${control.detail}`
  );
  return lines([
    "Parallax Identity And Storage Foundation",
    "========================================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Tenants: ${status.summary.tenant_count}`,
    `Principals: ${status.summary.principal_count}`,
    `Active sessions: ${status.summary.active_session_count}`,
    `Storage objects: ${status.summary.storage_object_count}`,
    `Storage checkpoints: ${status.summary.storage_checkpoint_count}`,
    `Raw token stored: ${status.summary.raw_token_stored ? "yes" : "no"}`,
    `Raw session token stored: ${status.summary.raw_session_token_stored ? "yes" : "no"}`,
    `Raw secret stored: ${status.summary.raw_secret_stored ? "yes" : "no"}`,
    `Direct cloud storage connection: ${status.summary.direct_cloud_storage_connection ? "yes" : "no"}`,
    "",
    "Controls",
    controls.length ? controls.join("\n") : "No controls."
  ]);
}

export function dataVendorStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    `  - ${control.id} | ${control.passed ? "passed" : "failed"} | ${control.detail}`
  );
  const adapters = status.adapters.map((adapter: any) =>
    [
      `  - ${adapter.adapter_id}`,
      adapter.tenant_slug,
      adapter.provider,
      adapter.data_license,
      `symbols=${adapter.allowed_symbols.join(",") || "any"}`
    ].join(" | ")
  );
  const imports = status.imports.map((item: any) =>
    [
      `  - ${item.tenant_slug}/${item.symbol}`,
      item.adapter_id,
      item.data_status_passed ? "data_status=passed" : "data_status=failed",
      item.data_dir
    ].join(" | ")
  );
  return lines([
    "Parallax External Data Vendor Boundary",
    "======================================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Adapters: ${status.summary.adapter_count}`,
    `Imports: ${status.summary.import_count}`,
    `Data status failures: ${status.summary.data_status_failed_count}`,
    `Raw secret stored: ${status.summary.raw_secret_stored ? "yes" : "no"}`,
    `Direct vendor network connection: ${status.summary.direct_vendor_network_connection ? "yes" : "no"}`,
    "",
    "Adapters",
    adapters.length ? adapters.join("\n") : "No data vendor adapters.",
    "",
    "Imports",
    imports.length ? imports.join("\n") : "No vendor data packs.",
    "",
    "Controls",
    controls.length ? controls.join("\n") : "No controls."
  ]);
}

export function dataVendorAdapterToHumanReport(result: any) {
  const adapter = result.adapter;
  return lines([
    "Parallax Data Vendor Adapter",
    "============================",
    "",
    `Adapter: ${adapter.adapter_id}`,
    `Name: ${adapter.name}`,
    `Tenant: ${adapter.tenant_slug}`,
    `Provider: ${adapter.provider}`,
    `License: ${adapter.data_license}`,
    `Allowed symbols: ${adapter.allowed_symbols.join(", ") || "Any"}`,
    `Direct vendor network connection: ${adapter.direct_vendor_network_connection ? "yes" : "no"}`,
    `Raw secret stored: ${adapter.raw_secret_stored ? "yes" : "no"}`,
    `Registry: ${result.registry_path}`
  ]);
}

export function dataVendorImportToHumanReport(result: any) {
  const item = result.import;
  return lines([
    "Parallax Data Vendor Import",
    "===========================",
    "",
    `Import ID: ${item.id}`,
    `Adapter: ${item.adapter_id}`,
    `Tenant: ${item.tenant_slug}`,
    `Symbol: ${item.symbol}`,
    `Provider: ${item.provider}`,
    `License: ${item.license}`,
    `Data dir: ${item.data_dir}`,
    `Data status: ${item.data_status_passed ? "passed" : "failed"}`,
    `Stale items: ${item.stale_item_count}`,
    `Restricted items: ${item.restricted_item_count}`,
    `Provenance hash: ${item.provenance_hash}`,
    `Direct vendor network connection: ${item.direct_vendor_network_connection ? "yes" : "no"}`,
    `Raw secret stored: ${item.raw_secret_stored ? "yes" : "no"}`
  ]);
}

export function llmProviderStatusToHumanReport(status: any) {
  const controls = status.controls.map((control: any) =>
    `  - ${control.id} | ${control.passed ? "passed" : "failed"} | ${control.detail}`
  );
  const adapters = status.adapters.map((adapter: any) =>
    [
      `  - ${adapter.adapter_id}`,
      adapter.tenant_slug,
      adapter.provider,
      adapter.model_registry_ref,
      `prompts=${adapter.prompt_ids.join(",")}`,
      `personas=${adapter.allowed_personas.length}`
    ].join(" | ")
  );
  const runs = status.runs.map((item: any) =>
    [
      `  - ${item.tenant_slug}/${item.symbol}`,
      item.adapter_id,
      item.council_eval_passed ? "eval=passed" : "eval=failed",
      item.action_class,
      `cost=$${item.usage?.estimated_cost_usd ?? "n/a"}`
    ].join(" | ")
  );
  return lines([
    "Parallax External LLM Provider Boundary",
    "=======================================",
    "",
    `Status: ${status.status}`,
    `Root dir: ${status.root_dir}`,
    `Adapters: ${status.summary.adapter_count}`,
    `Replay runs: ${status.summary.run_count}`,
    `Failed replay runs: ${status.summary.failed_replay_run_count}`,
    `Raw secret stored: ${status.summary.raw_secret_stored ? "yes" : "no"}`,
    `Direct model network connection: ${status.summary.direct_model_network_connection ? "yes" : "no"}`,
    "",
    "Adapters",
    adapters.length ? adapters.join("\n") : "No LLM provider adapters.",
    "",
    "Replay Runs",
    runs.length ? runs.join("\n") : "No external LLM replay runs.",
    "",
    "Controls",
    controls.length ? controls.join("\n") : "No controls."
  ]);
}

export function llmProviderAdapterToHumanReport(result: any) {
  const adapter = result.adapter;
  return lines([
    "Parallax LLM Provider Adapter",
    "=============================",
    "",
    `Adapter: ${adapter.adapter_id}`,
    `Name: ${adapter.name}`,
    `Tenant: ${adapter.tenant_slug}`,
    `Provider: ${adapter.provider}`,
    `Model: ${adapter.model_registry_ref}`,
    `Prompts: ${adapter.prompt_ids.join(", ")}`,
    `Personas: ${adapter.allowed_personas.length}`,
    `Eval suite: ${adapter.eval_suite.suite}`,
    `Eval passed: ${adapter.eval_suite.passed ? "yes" : "no"}`,
    `Max context tokens: ${adapter.max_context_tokens}`,
    `Max estimated cost: $${adapter.max_estimated_cost_usd}`,
    `Direct model network connection: ${adapter.direct_model_network_connection ? "yes" : "no"}`,
    `Raw secret stored: ${adapter.raw_secret_stored ? "yes" : "no"}`,
    `Registry: ${result.registry_path}`
  ]);
}

export function llmProviderRunToHumanReport(result: any) {
  const run = result.run;
  return lines([
    "Parallax LLM Provider Replay",
    "============================",
    "",
    `Run ID: ${run.id}`,
    `Adapter: ${run.adapter_id}`,
    `Tenant: ${run.tenant_slug}`,
    `Symbol: ${run.symbol}`,
    `Model: ${run.model_registry_ref}`,
    `Scenario: ${run.scenario}`,
    `Council eval: ${run.council_eval_passed ? "passed" : "failed"}`,
    `Eval problems: ${run.council_eval_problem_count}`,
    `Action class: ${run.action_class}`,
    `Context tokens: ${run.usage?.context_tokens ?? "n/a"}`,
    `Estimated cost: $${run.usage?.estimated_cost_usd ?? "n/a"}`,
    `Budget exceeded: ${run.usage?.budget_exceeded ? "yes" : "no"}`,
    `Direct model network connection: ${run.direct_model_network_connection ? "yes" : "no"}`,
    `Raw secret stored: ${run.raw_secret_stored ? "yes" : "no"}`,
    `Audit path: ${run.audit_path || "not written"}`
  ]);
}

export function teamInitToHumanReport(result: any) {
  return lines([
    "Parallax Team Workspace",
    "=======================",
    "",
    `Workspace: ${result.workspace.name}`,
    `Workspace ID: ${result.workspace.id}`,
    `Members: ${result.member_count}`,
    `Ledger: ${result.ledger_path}`,
    "",
    "Boundary",
    `  ${result.workspace.product_boundary}`
  ]);
}

export function teamMemberToHumanReport(result: any) {
  return lines([
    "Parallax Team Member",
    "====================",
    "",
    `Name: ${result.member.name}`,
    `Role: ${result.member.role}`,
    `Status: ${result.member.status}`,
    `Ledger: ${result.ledger_path}`,
    "",
    "Permissions",
    bullet(result.permissions ?? [])
  ]);
}

export function teamAssignmentToHumanReport(result: any) {
  const assignment = result.assignment;
  return lines([
    "Parallax Review Assignment",
    "==========================",
    "",
    `Assignment ID: ${assignment.id}`,
    `Dossier ID: ${assignment.dossier_id}`,
    `Symbol: ${assignment.symbol}`,
    `Review type: ${assignment.review_type}`,
    `Assignee: ${assignment.assignee}`,
    `Status: ${assignment.status}`,
    `Due at: ${compact(assignment.due_at)}`,
    `Audit: ${assignment.audit_path}`,
    "",
    "Note",
    `  ${compact(assignment.note)}`
  ]);
}

export function teamCommentToHumanReport(result: any) {
  const comment = result.comment;
  return lines([
    "Parallax Governance Comment",
    "===========================",
    "",
    `Comment ID: ${comment.id}`,
    `Dossier ID: ${comment.dossier_id}`,
    `Symbol: ${comment.symbol}`,
    `Author: ${comment.author}`,
    `Tags: ${comment.tags.length ? comment.tags.join(", ") : "None."}`,
    `Created at: ${comment.created_at}`,
    "",
    "Comment",
    `  ${compact(comment.body)}`
  ]);
}

export function teamApprovalToHumanReport(result: any) {
  const approval = result.approval;
  return lines([
    "Parallax Governance Approval",
    "============================",
    "",
    `Approval ID: ${approval.id}`,
    `Assignment ID: ${approval.assignment_id}`,
    `Dossier ID: ${approval.dossier_id}`,
    `Review type: ${approval.review_type}`,
    `Approver: ${approval.approver}`,
    `Decision: ${approval.decision}`,
    `Created at: ${approval.created_at}`,
    "",
    "Rationale",
    `  ${compact(approval.rationale)}`
  ]);
}

export function teamGovernanceToHumanReport(report: any) {
  const releaseRows = report.release_controls.map((control: any, index: number) =>
    [
      `${index + 1}. ${control.symbol}`,
      control.action_class,
      control.status,
      `ready=${control.release_ready ? "yes" : "no"}`,
      control.missing_review_types.length ? `missing=${control.missing_review_types.join(",")}` : "missing=none",
      control.registry_validation.passed ? "registry=passed" : `registry=${control.registry_validation.problems.join("; ")}`
    ].join(" | ")
  );
  const assignmentRows = report.assignments.slice(-8).map((assignment: any) =>
    [
      assignment.id,
      assignment.symbol,
      assignment.review_type,
      assignment.assignee,
      assignment.status
    ].join(" | ")
  );
  const controlRows = report.soc2_readiness.controls.map((control: any) =>
    `  - ${control.id} ${control.status}: ${control.name}`
  );

  return lines([
    "Parallax Team Governance",
    "========================",
    "",
    `Workspace: ${report.summary.workspace_name}`,
    `Audit dir: ${report.summary.audit_dir}`,
    `Members: ${report.summary.member_count}`,
    `Dossiers: ${report.summary.dossier_count}`,
    `Assignments: ${report.summary.assignment_count}`,
    `Open assignments: ${report.summary.open_assignment_count}`,
    `Comments: ${report.summary.comment_count}`,
    `Approvals: ${report.summary.approval_count}`,
    `Release ready: ${report.summary.release_ready_count}`,
    `Blocked releases: ${report.summary.blocked_release_count}`,
    `SOC 2 readiness: ${report.soc2_readiness.status}`,
    "",
    "Release Controls",
    releaseRows.length ? releaseRows.join("\n") : "No dossiers found.",
    "",
    "Recent Assignments",
    assignmentRows.length ? assignmentRows.join("\n") : "No review assignments.",
    "",
    "SOC 2 Readiness Program",
    controlRows.join("\n")
  ]);
}

export function teamGovernanceExportToHumanReport(result: any) {
  return lines([
    "Parallax Governance Export",
    "==========================",
    "",
    `Output: ${result.out}`,
    `Workspace: ${result.workspace_name}`,
    `Dossiers: ${result.dossier_count}`,
    `Release ready: ${result.release_ready_count}`,
    `Assignments: ${result.assignment_count}`,
    `Comments: ${result.comment_count}`,
    `Approvals: ${result.approval_count}`,
    `SOC 2 readiness: ${result.soc2_status}`
  ]);
}

export function appToHumanReport(result: any) {
  return lines([
    "Parallax Local App",
    "==================",
    "",
    `Dashboard: ${result.out}`,
    `Audit dir: ${result.audit_dir}`,
    `Bytes: ${result.bytes}`
  ]);
}

export function alertsToHumanReport(result: any) {
  const rows = result.entries.map((entry: any, index: number) =>
    [
      `${index + 1}. ${entry.symbol}`,
      `status=${entry.status}`,
      `${entry.previous_state}->${entry.current_state}`,
      `price=${compact(entry.checked_price)}`,
      `triggers=${entry.fired_triggers?.length ?? 0}`,
      `change=${entry.change_since_last_run?.status ?? "n/a"}`,
      entry.muted ? "muted=yes" : "",
      entry.audit_path
    ].filter(Boolean).join(" | ")
  );

  return lines([
    "Parallax Workspace Alerts",
    "=========================",
    "",
    `Checked at: ${result.checked_at}`,
    `Audit dir: ${result.audit_dir}`,
    `Dossiers: ${result.dossier_count}`,
    `Need attention: ${result.attention_count}`,
    `Notifications: ${result.notification_count ?? 0}`,
    "",
    rows.length ? rows.join("\n") : "No dossiers found.",
    "",
    "Interpretation",
    result.attention_count > 0
      ? "  At least one thesis changed state or fired a lifecycle trigger."
      : "  No saved thesis changed state under the checked conditions."
  ]);
}

export function alertPreferencesToHumanReport(preferences: any) {
  return lines([
    "Parallax Alert Preferences",
    "==========================",
    "",
    `Audit dir: ${preferences.audit_dir}`,
    `Channels: ${preferences.channels.join(", ")}`,
    `Quiet unchanged: ${preferences.quiet_unchanged ? "yes" : "no"}`,
    `Notify states: ${preferences.notify_on_states.join(", ")}`,
    `Notify trigger kinds: ${preferences.notify_on_trigger_kinds.join(", ")}`,
    `Minimum freshness: ${preferences.min_freshness_score}`,
    `Muted symbols: ${preferences.muted_symbols.length ? preferences.muted_symbols.join(", ") : "None."}`
  ]);
}

export function lifecycleTriggerToHumanReport(result: any) {
  const trigger = result.trigger;
  return lines([
    "Parallax Lifecycle Trigger",
    "==========================",
    "",
    `Dossier ID: ${result.dossier_id}`,
    `Override path: ${result.override_path}`,
    "",
    "Trigger",
    `  ID: ${trigger.id}`,
    `  Kind: ${trigger.kind}`,
    `  Condition type: ${trigger.condition_type}`,
    `  Condition: ${trigger.condition}`,
    `  Rationale: ${trigger.human_rationale}`,
    `  Linked assumption: ${compact(trigger.linked_assumption)}`
  ]);
}

export function lifecycleOverridesToHumanReport(result: any) {
  const rows = Object.values(result.overrides).flatMap((override: any) =>
    (override.custom_triggers ?? []).map((trigger: any) =>
      [
        override.dossier_id,
        trigger.id,
        trigger.kind,
        trigger.condition_type,
        trigger.condition,
        trigger.human_rationale
      ].join(" | ")
    )
  );

  return lines([
    "Parallax Lifecycle Overrides",
    "============================",
    "",
    `Audit dir: ${result.audit_dir}`,
    `Dossiers with overrides: ${Object.keys(result.overrides).length}`,
    "",
    rows.length ? rows.join("\n") : "No custom lifecycle triggers."
  ]);
}

export function lifecycleNotificationsToHumanReport(result: any) {
  const rows = result.notifications.map((item: any, index: number) =>
    [
      `${index + 1}. ${item.symbol}`,
      item.severity,
      item.current_state,
      item.title,
      item.created_at,
      item.audit_path
    ].join(" | ")
  );

  return lines([
    "Parallax Lifecycle Notifications",
    "=================================",
    "",
    `Audit dir: ${result.audit_dir}`,
    `Notifications: ${result.notifications.length}`,
    "",
    rows.length ? rows.join("\n") : "No lifecycle notifications."
  ]);
}

export function llmEvalToHumanReport(report: any) {
  const rows = report.cases.map((item: any, index: number) =>
    [
      `${index + 1}. ${item.name}`,
      `expected=${item.expected_pass ? "pass" : "fail"}`,
      `observed=${item.observed_pass ? "pass" : "fail"}`,
      `result=${item.passed ? "ok" : "not ok"}`,
      `problems=${item.problems.length}`,
      item.usage ? `tokens=${item.usage.context_tokens}` : "",
      item.usage ? `cost=$${item.usage.estimated_cost_usd}` : "",
      `context_warnings=${item.context_warnings ?? 0}`
    ].filter(Boolean).join(" | ")
  );

  return lines([
    "Parallax LLM Council Eval",
    "=========================",
    "",
    `Suite: ${report.suite}`,
    `Created at: ${report.created_at}`,
    `Passed: ${report.passed ? "yes" : "no"}`,
    `Cases: ${report.case_count}`,
    "",
    "Cases",
    rows.join("\n"),
    "",
    "Interpretation",
    report.passed
      ? "  The scripted LLM council admits evidence-bound packets and rejects hallucinated refs, unsupported calculations, hidden recommendations, prompt-injection obedience, and cost overrun."
      : "  One or more LLM council safety gates failed and must be fixed before using this provider path."
  ]);
}

export function promptRegistryToHumanReport(registry: any) {
  const prompts = Object.values(registry.prompts).map((prompt: any) =>
    `  - ${prompt.id}@${prompt.version}: ${prompt.purpose}`
  );
  const providers = Object.values(registry.providers).map((provider: any) =>
    `  - ${provider.id}: ${provider.kind}, max ${provider.max_context_tokens} context tokens, max $${provider.max_estimated_cost_usd}`
  );
  const personas = Object.values(registry.personas).map((persona: any) =>
    `  - ${persona.id}: ${persona.tool_permissions.join(", ")}`
  );

  return lines([
    "Parallax Prompt Registry",
    "========================",
    "",
    "Prompts",
    prompts.join("\n"),
    "",
    "Providers",
    providers.join("\n"),
    "",
    "Personas",
    personas.join("\n")
  ]);
}
