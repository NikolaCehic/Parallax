import { makeId, clamp, stableHash } from "../core/ids.js";
import { ACTION_RANK, capActionClass } from "../core/schemas.js";

function highestProposedAction(claimPackets) {
  return claimPackets.reduce((best, packet) => {
    if (ACTION_RANK.get(packet.proposed_action) > ACTION_RANK.get(best)) return packet.proposed_action;
    return best;
  }, "no_trade");
}

export function applyDecisionGate({
  dossierId,
  claimPackets,
  toolOutputs,
  summary,
  actionCeiling = "watchlist",
  auditBundleRef = "pending"
}) {
  const activeVetoes = claimPackets
    .filter((packet) => packet.veto.active)
    .map((packet) => ({ persona_id: packet.persona_id, reason: packet.veto.reason }));

  const failedTools = toolOutputs
    .filter((output) => output.status === "failed")
    .map((output) => ({ tool_name: output.tool_name, reason: "Tool failed." }));

  const dataWarnings = toolOutputs
    .filter((output) => output.tool_name === "data_quality_check" && output.status !== "passed")
    .map((output) => ({ tool_name: output.tool_name, reason: "Data quality warning." }));

  const vetoes = [...activeVetoes, ...failedTools, ...dataWarnings];
  const supportCount = claimPackets.filter((packet) => packet.stance === "support").length;
  const opposeCount = claimPackets.filter((packet) => packet.stance === "oppose").length;
  const needsDataCount = claimPackets.filter((packet) => packet.stance === "needs_more_data").length;
  let proposed = vetoes.length > 0 ? "no_trade" : highestProposedAction(claimPackets);
  if (
    vetoes.length === 0 &&
    ACTION_RANK.get(actionCeiling) >= ACTION_RANK.get("paper_trade_candidate") &&
    supportCount >= 6 &&
    opposeCount === 0 &&
    needsDataCount <= 2
  ) {
    proposed = "paper_trade_candidate";
  }
  const actionClass = capActionClass(proposed, actionCeiling);

  let confidence = 0.45 + supportCount * 0.04 - opposeCount * 0.06 - needsDataCount * 0.03;
  if (summary.required_checks.length > 0) confidence -= 0.08;
  if (vetoes.length > 0) confidence = 0;
  confidence = clamp(Number(confidence.toFixed(3)));

  const confidenceCapReason = vetoes.length > 0
    ? "hard_veto"
    : opposeCount > 0
      ? "unresolved_dissent"
      : summary.required_checks.length > 0
        ? "required_checks"
        : "none";

  const body = {
    dossier_id: dossierId,
    action_class: actionClass,
    thesis_state: "draft",
    confidence,
    freshness_score: 1,
    confidence_cap_reason: confidenceCapReason,
    vetoes,
    dissent: summary.dissent,
    invalidators: summary.invalidators,
    next_review_trigger: summary.invalidators[0] ?? "time_expiry",
    audit_bundle_ref: auditBundleRef
  };

  return {
    id: makeId("dp", { ...body, hash: stableHash(body) }),
    ...body
  };
}
