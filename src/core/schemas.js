export const ACTION_CLASSES = [
  "no_trade",
  "research_needed",
  "watchlist",
  "paper_trade_candidate",
  "order_ticket_candidate"
];

export const ACTION_RANK = new Map(ACTION_CLASSES.map((action, index) => [action, index]));

export const THESIS_STATES = [
  "draft",
  "active",
  "stale",
  "invalidated",
  "upgraded",
  "closed",
  "archived"
];

export const TRIGGER_KINDS = ["observe", "recheck", "downgrade", "invalidate", "escalate"];

export class ValidationError extends Error {
  constructor(message, path = "$") {
    super(`${path}: ${message}`);
    this.name = "ValidationError";
    this.path = path;
  }
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function assertObject(value, path) {
  if (!isObject(value)) throw new ValidationError("expected object", path);
}

function assertString(value, path) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ValidationError("expected non-empty string", path);
  }
}

function assertNumber(value, path) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new ValidationError("expected number", path);
  }
}

function assertArray(value, path) {
  if (!Array.isArray(value)) throw new ValidationError("expected array", path);
}

function assertEnum(value, allowed, path) {
  if (!allowed.includes(value)) {
    throw new ValidationError(`expected one of ${allowed.join(", ")}`, path);
  }
}

function optionalArray(value, path) {
  if (value === undefined) return;
  assertArray(value, path);
}

export function assertEvidenceItem(item, path = "$") {
  assertObject(item, path);
  for (const key of ["id", "kind", "source", "as_of", "retrieved_at", "freshness_status", "license", "payload_ref", "hash"]) {
    assertString(item[key], `${path}.${key}`);
  }
  assertEnum(item.freshness_status, ["fresh", "stale", "unknown"], `${path}.freshness_status`);
  assertEnum(item.license, ["public", "internal", "restricted"], `${path}.license`);
  if (item.symbol !== undefined) assertString(item.symbol, `${path}.symbol`);
}

export function assertEvidenceSnapshot(snapshot, path = "$") {
  assertObject(snapshot, path);
  for (const key of ["id", "created_at", "hash"]) assertString(snapshot[key], `${path}.${key}`);
  assertObject(snapshot.question, `${path}.question`);
  assertArray(snapshot.items, `${path}.items`);
  snapshot.items.forEach((item, index) => assertEvidenceItem(item, `${path}.items[${index}]`));
}

export function assertToolOutput(output, path = "$") {
  assertObject(output, path);
  for (const key of ["id", "tool_name", "tool_version", "created_at", "status", "result_hash"]) {
    assertString(output[key], `${path}.${key}`);
  }
  assertEnum(output.status, ["passed", "warning", "failed"], `${path}.status`);
  assertArray(output.inputs, `${path}.inputs`);
  assertObject(output.result, `${path}.result`);
}

export function assertPersonaClaimPacket(packet, path = "$") {
  assertObject(packet, path);
  for (const key of ["id", "persona_id", "stance", "claim_type", "thesis", "proposed_action"]) {
    assertString(packet[key], `${path}.${key}`);
  }
  assertEnum(packet.stance, ["support", "oppose", "abstain", "needs_more_data"], `${path}.stance`);
  assertEnum(packet.claim_type, ["fact", "calculation", "inference", "hypothesis", "risk", "invalidator"], `${path}.claim_type`);
  assertEnum(packet.proposed_action, ACTION_CLASSES, `${path}.proposed_action`);
  assertNumber(packet.confidence, `${path}.confidence`);
  assertArray(packet.evidence_refs, `${path}.evidence_refs`);
  for (const key of ["assumptions", "base_rates", "invalidators", "risks", "required_checks"]) {
    optionalArray(packet[key], `${path}.${key}`);
  }
  assertObject(packet.veto, `${path}.veto`);
  if (typeof packet.veto.active !== "boolean") throw new ValidationError("expected boolean", `${path}.veto.active`);
  if (packet.veto.active) assertString(packet.veto.reason, `${path}.veto.reason`);
}

export function assertThesisTrigger(trigger, path = "$") {
  assertObject(trigger, path);
  for (const key of ["id", "kind", "condition_type", "condition", "human_rationale"]) {
    assertString(trigger[key], `${path}.${key}`);
  }
  assertEnum(trigger.kind, TRIGGER_KINDS, `${path}.kind`);
  if (trigger.last_checked_at !== undefined) assertString(trigger.last_checked_at, `${path}.last_checked_at`);
}

export function assertThesisLifecycle(lifecycle, path = "$") {
  assertObject(lifecycle, path);
  for (const key of ["dossier_id", "state", "valid_as_of", "expires_at", "last_revalidated_at"]) {
    assertString(lifecycle[key], `${path}.${key}`);
  }
  assertEnum(lifecycle.state, THESIS_STATES, `${path}.state`);
  assertNumber(lifecycle.freshness_score, `${path}.freshness_score`);
  assertArray(lifecycle.dependency_refs, `${path}.dependency_refs`);
  assertArray(lifecycle.triggers, `${path}.triggers`);
  lifecycle.triggers.forEach((trigger, index) => assertThesisTrigger(trigger, `${path}.triggers[${index}]`));
}

export function assertDecisionPacket(packet, path = "$") {
  assertObject(packet, path);
  for (const key of ["id", "dossier_id", "action_class", "thesis_state", "confidence", "freshness_score", "confidence_cap_reason", "next_review_trigger", "audit_bundle_ref"]) {
    if (key === "confidence" || key === "freshness_score") assertNumber(packet[key], `${path}.${key}`);
    else assertString(packet[key], `${path}.${key}`);
  }
  assertEnum(packet.action_class, ACTION_CLASSES, `${path}.action_class`);
  assertEnum(packet.thesis_state, THESIS_STATES, `${path}.thesis_state`);
  assertArray(packet.vetoes, `${path}.vetoes`);
  assertArray(packet.dissent, `${path}.dissent`);
  assertArray(packet.invalidators, `${path}.invalidators`);
}

export function assertTradeThesisDossier(dossier, path = "$") {
  assertObject(dossier, path);
  for (const key of ["id", "created_at", "title", "symbol", "horizon", "thesis", "action_class"]) {
    assertString(dossier[key], `${path}.${key}`);
  }
  assertEnum(dossier.action_class, ACTION_CLASSES, `${path}.action_class`);
  assertEvidenceSnapshot(dossier.evidence_snapshot, `${path}.evidence_snapshot`);
  assertArray(dossier.tool_outputs, `${path}.tool_outputs`);
  dossier.tool_outputs.forEach((output, index) => assertToolOutput(output, `${path}.tool_outputs[${index}]`));
  assertArray(dossier.claim_packets, `${path}.claim_packets`);
  dossier.claim_packets.forEach((packet, index) => assertPersonaClaimPacket(packet, `${path}.claim_packets[${index}]`));
  assertObject(dossier.summary, `${path}.summary`);
  assertDecisionPacket(dossier.decision_packet, `${path}.decision_packet`);
  assertThesisLifecycle(dossier.lifecycle, `${path}.lifecycle`);
}

export function capActionClass(action, ceiling) {
  assertEnum(action, ACTION_CLASSES, "$.action");
  assertEnum(ceiling, ACTION_CLASSES, "$.ceiling");
  return ACTION_RANK.get(action) > ACTION_RANK.get(ceiling) ? ceiling : action;
}
