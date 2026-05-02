import { makeId, isoNow } from "./core/ids.js";
import path from "node:path";
import { assertDecisionPacket, assertEvidenceSnapshot, assertThesisLifecycle, assertTradeThesisDossier } from "./core/schemas.js";
import { buildEvidenceSnapshot } from "./evidence/store.js";
import { runAnalytics } from "./analytics/run.js";
import { crossExamine, synthesizeDossierSummary } from "./council/runner.js";
import { runCouncilProvider } from "./council/provider.js";
import { applyDecisionGate } from "./decision/gate.js";
import { assignLifecycle } from "./lifecycle/engine.js";
import { writeAuditBundle } from "./audit.js";
import { reviewProductPolicy } from "./product/policy.js";

export async function analyzeThesis({
  symbol,
  horizon = "swing",
  thesis,
  dataDir = "fixtures",
  actionCeiling = "watchlist",
  userClass = "self_directed_investor",
  intendedUse = "research",
  now = isoNow(),
  audit = false,
  auditDir = "audits",
  councilMode = "deterministic",
  llmScenario = "safe",
  llmBudget = undefined
}) {
  const policyReview = reviewProductPolicy({
    symbol,
    thesis,
    actionCeiling,
    userClass,
    intendedUse
  });

  const snapshot = await buildEvidenceSnapshot({ symbol, horizon, thesis, dataDir, now });
  assertEvidenceSnapshot(snapshot);

  const toolOutputs = runAnalytics(snapshot, { now });
  const councilRun = runCouncilProvider({
    snapshot,
    toolOutputs,
    policyReview,
    councilMode,
    llmScenario,
    llmBudget
  });
  const claimPackets = councilRun.claim_packets;
  const crossExamination = crossExamine(claimPackets);
  const summary = synthesizeDossierSummary({ claimPackets, crossExamination });

  const dossierId = makeId("dos", { symbol, horizon, thesis, snapshot: snapshot.hash, now });
  const auditBundleRef = audit ? path.join(auditDir, `${dossierId}.json`) : "pending";
  const decisionPacket = applyDecisionGate({
    dossierId,
    claimPackets,
    toolOutputs,
    summary,
    policyReview,
    councilEval: councilRun.eval_report,
    actionCeiling: policyReview.effective_action_ceiling,
    auditBundleRef
  });

  const lifecycle = assignLifecycle({ dossierId, snapshot, toolOutputs, decisionPacket, now });
  decisionPacket.thesis_state = lifecycle.state;
  decisionPacket.freshness_score = lifecycle.freshness_score;
  assertDecisionPacket(decisionPacket);
  assertThesisLifecycle(lifecycle);

  const dossier = {
    id: dossierId,
    created_at: now,
    title: `${symbol} ${horizon} thesis dossier`,
    symbol,
    horizon,
    thesis,
    action_class: decisionPacket.action_class,
    evidence_snapshot: snapshot,
    policy_review: policyReview,
    tool_outputs: toolOutputs,
    council_run: {
      provider: councilRun.provider,
      eval_report: councilRun.eval_report,
      contexts: councilRun.contexts ?? [],
      usage: councilRun.usage ?? null
    },
    claim_packets: claimPackets,
    cross_examination: crossExamination,
    summary,
    decision_packet: decisionPacket,
    lifecycle
  };

  assertTradeThesisDossier(dossier);

  if (audit) {
    await writeAuditBundle(dossier, { auditDir });
  }

  return dossier;
}

export { readAuditBundle, replayAuditBundle, writeAuditBundle } from "./audit.js";
export { evaluateLifecycle } from "./lifecycle/engine.js";
export { reviewProductPolicy, productPolicySnapshot } from "./product/policy.js";
export { evaluateClaimPackets, runCouncilProvider } from "./council/provider.js";
export { promptRegistrySnapshot } from "./llm/registry.js";
export { runLLMEvalSuite } from "./llm/evals.js";
export { buildEvidenceOnlyContext } from "./llm/context.js";
export {
  addLifecycleTrigger,
  applyLifecycleOverrides,
  readAlertPreferences,
  readLifecycleNotifications,
  readLifecycleOverrides,
  updateAlertPreferences
} from "./lifecycle/workspace.js";
export {
  closeLedgerTrade,
  loadPaperLedger,
  openPaperTrade,
  paperLedgerReport,
  recordPaperReview
} from "./paper/lab.js";
export {
  addTeamMember,
  approveGovernanceReview,
  assignGovernanceReview,
  buildGovernanceReport,
  exportGovernancePackage,
  initializeTeamWorkspace,
  loadTeamGovernance,
  recordGovernanceComment
} from "./team/governance.js";
export {
  approvePartnerOrder,
  createPartnerOrderTicket,
  evaluatePartnerOrderControls,
  loadPartnerExecutionLedger,
  partnerExecutionReport,
  recordLegalApproval,
  recordMarketAccessReview,
  recordPostTradeReview,
  registerExecutionPartner,
  submitPartnerOrder,
  updatePartnerKillSwitch
} from "./execution/partner.js";
