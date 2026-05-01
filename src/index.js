import { makeId, isoNow } from "./core/ids.js";
import path from "node:path";
import { assertDecisionPacket, assertEvidenceSnapshot, assertThesisLifecycle, assertTradeThesisDossier } from "./core/schemas.js";
import { buildEvidenceSnapshot } from "./evidence/store.js";
import { runAnalytics } from "./analytics/run.js";
import { runCouncil, crossExamine, synthesizeDossierSummary } from "./council/runner.js";
import { applyDecisionGate } from "./decision/gate.js";
import { assignLifecycle } from "./lifecycle/engine.js";
import { writeAuditBundle } from "./audit.js";

export async function analyzeThesis({
  symbol,
  horizon = "swing",
  thesis,
  dataDir = "fixtures",
  actionCeiling = "watchlist",
  now = isoNow(),
  audit = false,
  auditDir = "audits"
}) {
  const snapshot = await buildEvidenceSnapshot({ symbol, horizon, thesis, dataDir, now });
  assertEvidenceSnapshot(snapshot);

  const toolOutputs = runAnalytics(snapshot, { now });
  const claimPackets = runCouncil({ snapshot, toolOutputs });
  const crossExamination = crossExamine(claimPackets);
  const summary = synthesizeDossierSummary({ claimPackets, crossExamination });

  const dossierId = makeId("dos", { symbol, horizon, thesis, snapshot: snapshot.hash, now });
  const auditBundleRef = audit ? path.join(auditDir, `${dossierId}.json`) : "pending";
  const decisionPacket = applyDecisionGate({
    dossierId,
    claimPackets,
    toolOutputs,
    summary,
    actionCeiling,
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
    tool_outputs: toolOutputs,
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
