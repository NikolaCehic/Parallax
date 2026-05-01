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

## Council Summary

${dossier.summary.council_summary}

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
    `  3. Python analytics: generated ${dossier.tool_outputs.length} deterministic tool outputs.`,
    `  4. Council: collected ${dossier.claim_packets.length} persona claim packets.`,
    `  5. Cross-examination: ${dossier.cross_examination.veto_count} vetoes, ${dossier.cross_examination.opposed_personas.length} opposing personas, ${dossier.cross_examination.required_checks.length} required checks.`,
    "  6. Synthesis: preserved strongest bull case, bear case, risks, and invalidators.",
    `  7. Decision gate: ${titleCaseAction(dossier.decision_packet.action_class)} with confidence ${dossier.decision_packet.confidence}.`,
    `  8. Lifecycle: thesis is ${dossier.lifecycle.state} until ${dossier.lifecycle.expires_at}.`,
    `  9. Artifacts: audit and markdown dossier written${auditPath ? ` to ${auditPath}` : ""}.`,
    "",
    "Decision",
    `  Action class: ${titleCaseAction(dossier.decision_packet.action_class)}`,
    `  Thesis state: ${dossier.lifecycle.state}`,
    `  Confidence: ${dossier.decision_packet.confidence}`,
    `  Freshness: ${dossier.lifecycle.freshness_score}`,
    `  Confidence cap: ${dossier.decision_packet.confidence_cap_reason}`,
    `  Next review trigger: ${dossier.decision_packet.next_review_trigger}`,
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
