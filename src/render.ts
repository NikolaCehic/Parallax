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
    `Lifecycle files: ${result.lifecycle_file_count ?? 0}`
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
    `Lifecycle files: ${result.lifecycle_file_count ?? 0}`
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
