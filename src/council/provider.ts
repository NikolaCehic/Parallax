import { ACTION_RANK, assertPersonaClaimPacket } from "../core/schemas.js";
import { makeId, stableHash } from "../core/ids.js";
import { PERSONAS, runPersona } from "./personas.js";

export const DEFAULT_COUNCIL_PROVIDER = {
  id: "deterministic_rule_council_v0",
  kind: "deterministic",
  model_registry_ref: "rule_council_v0",
  version: "0.1.0"
} as const;

function validRefIds(snapshot: any, toolOutputs: any[]) {
  return new Set([
    ...snapshot.items.map((item: any) => item.id),
    ...toolOutputs.map((output: any) => output.id)
  ]);
}

function hasToolRef(packet: any, toolOutputs: any[]) {
  const toolIds = new Set(toolOutputs.map((output: any) => output.id));
  return packet.evidence_refs.some((ref: string) => toolIds.has(ref));
}

export function evaluateClaimPackets({
  provider = DEFAULT_COUNCIL_PROVIDER,
  snapshot,
  toolOutputs,
  claimPackets,
  policyReview
}: {
  provider?: any;
  snapshot: any;
  toolOutputs: any[];
  claimPackets: any[];
  policyReview?: any;
}) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const refs = validRefIds(snapshot, toolOutputs);

  for (const packet of claimPackets) {
    try {
      assertPersonaClaimPacket(packet);
    } catch (error: any) {
      problems.push(`${packet.persona_id ?? "unknown"} failed claim schema validation: ${error.message}`);
      continue;
    }

    for (const ref of packet.evidence_refs) {
      if (!refs.has(ref)) {
        problems.push(`${packet.persona_id} references unknown evidence/tool id ${ref}.`);
      }
    }

    if (packet.claim_type === "calculation" && !hasToolRef(packet, toolOutputs)) {
      problems.push(`${packet.persona_id} made a calculation claim without a tool-output reference.`);
    }

    if (
      policyReview?.effective_action_ceiling &&
      ACTION_RANK.get(packet.proposed_action)! > ACTION_RANK.get(policyReview.effective_action_ceiling)!
    ) {
      warnings.push(
        `${packet.persona_id} proposed ${packet.proposed_action}, above effective product ceiling ${policyReview.effective_action_ceiling}.`
      );
    }
  }

  const body = {
    provider_id: provider.id,
    provider_kind: provider.kind,
    model_registry_ref: provider.model_registry_ref,
    provider_version: provider.version,
    claim_packet_count: claimPackets.length,
    passed: problems.length === 0,
    problems,
    warnings,
    evaluated_refs: refs.size
  };

  return {
    id: makeId("ceval", { ...body, hash: stableHash(body) }),
    ...body
  };
}

export function runCouncilProvider({
  snapshot,
  toolOutputs,
  personas = PERSONAS,
  policyReview,
  provider = DEFAULT_COUNCIL_PROVIDER
}: {
  snapshot: any;
  toolOutputs: any[];
  personas?: string[];
  policyReview?: any;
  provider?: any;
}) {
  const claimPackets = personas.map((personaId) => runPersona(personaId, { snapshot, toolOutputs }));
  const evalReport = evaluateClaimPackets({
    provider,
    snapshot,
    toolOutputs,
    claimPackets,
    policyReview
  });

  return {
    provider,
    claim_packets: claimPackets,
    eval_report: evalReport
  };
}
