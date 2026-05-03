import { ACTION_RANK, assertPersonaClaimPacket } from "../core/schemas.js";
import { makeId, stableHash } from "../core/ids.js";
import { PERSONAS, runPersona } from "./personas.js";
import { runScriptedLLMCouncil, type ScriptedLLMScenario } from "../llm/scripted.js";
import { runLiveLLMCouncil } from "../llm/live.js";

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

function hiddenRecommendationLanguage(text = "") {
  return /\b(you should buy|you should sell|buy now|sell now|must recommend|guaranteed|place an order|execute (the )?trade|market order)\b/i.test(text);
}

function finalizeEvalReport(body: any) {
  const { id: _id, ...stableBody } = body;
  return {
    id: makeId("ceval", { ...stableBody, hash: stableHash(stableBody) }),
    ...stableBody
  };
}

export function evaluateClaimPackets({
  provider = DEFAULT_COUNCIL_PROVIDER,
  snapshot,
  toolOutputs,
  claimPackets,
  policyReview,
  expectedPersonas,
  strictActionCeiling = false,
  contextWarnings = []
}: {
  provider?: any;
  snapshot: any;
  toolOutputs: any[];
  claimPackets: any[];
  policyReview?: any;
  expectedPersonas?: string[];
  strictActionCeiling?: boolean;
  contextWarnings?: string[];
}) {
  const problems: string[] = [];
  const warnings: string[] = [];
  const refs = validRefIds(snapshot, toolOutputs);
  const isLLMProvider = String(provider.kind ?? "").includes("llm");

  if (claimPackets.length === 0) {
    problems.push("Council provider returned no claim packets.");
  }

  if (expectedPersonas?.length) {
    const seen = new Map<string, number>();
    for (const packet of claimPackets) {
      if (packet.persona_id) seen.set(packet.persona_id, (seen.get(packet.persona_id) ?? 0) + 1);
    }
    for (const personaId of expectedPersonas) {
      if (!seen.has(personaId)) problems.push(`Expected persona ${personaId} did not return a claim packet.`);
    }
    for (const [personaId, count] of seen.entries()) {
      if (!expectedPersonas.includes(personaId)) problems.push(`Unexpected persona ${personaId} returned a claim packet.`);
      if (count > 1) problems.push(`Persona ${personaId} returned ${count} claim packets.`);
    }
  }

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

    if (isLLMProvider && packet.evidence_refs.length === 0) {
      problems.push(`${packet.persona_id} returned no evidence_refs.`);
    }

    if (packet.claim_type === "calculation" && !hasToolRef(packet, toolOutputs)) {
      problems.push(`${packet.persona_id} made a calculation claim without a tool-output reference.`);
    }

    if (
      policyReview?.effective_action_ceiling &&
      ACTION_RANK.get(packet.proposed_action)! > ACTION_RANK.get(policyReview.effective_action_ceiling)!
    ) {
      const message = `${packet.persona_id} proposed ${packet.proposed_action}, above effective product ceiling ${policyReview.effective_action_ceiling}.`;
      if (strictActionCeiling) problems.push(message);
      else warnings.push(message);
    }

    if (isLLMProvider && hiddenRecommendationLanguage(packet.thesis)) {
      problems.push(`${packet.persona_id} used hidden recommendation or execution language in its thesis.`);
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
    context_warning_count: contextWarnings.length,
    context_warnings: contextWarnings,
    evaluated_refs: refs.size
  };

  return finalizeEvalReport(body);
}

export async function runCouncilProvider({
  snapshot,
  toolOutputs,
  personas = PERSONAS,
  policyReview,
  provider = DEFAULT_COUNCIL_PROVIDER,
  councilMode = "deterministic",
  llmScenario = "safe",
  llmBudget,
  llmProviderOptions
}: {
  snapshot: any;
  toolOutputs: any[];
  personas?: string[];
  policyReview?: any;
  provider?: any;
  councilMode?: string;
  llmScenario?: ScriptedLLMScenario | string;
  llmBudget?: {
    maxContextTokens?: number;
    maxEstimatedCostUsd?: number;
  };
  llmProviderOptions?: any;
}) {
  if (councilMode === "llm-live" || provider.kind === "llm_live_openai_responses") {
    const liveRun = await runLiveLLMCouncil({
      snapshot,
      toolOutputs,
      personas,
      policyReview,
      providerOptions: llmProviderOptions,
      budget: llmBudget
    });
    let evalReport = evaluateClaimPackets({
      provider: liveRun.provider,
      snapshot,
      toolOutputs,
      claimPackets: liveRun.claim_packets,
      policyReview,
      expectedPersonas: personas,
      strictActionCeiling: true,
      contextWarnings: liveRun.context_warnings
    });
    if (liveRun.failure) {
      evalReport = finalizeEvalReport({
        ...evalReport,
        passed: false,
        problems: [...evalReport.problems, `Provider failure: ${liveRun.failure}.`]
      });
    }

    return {
      provider: liveRun.provider,
      claim_packets: liveRun.claim_packets,
      eval_report: evalReport,
      contexts: liveRun.contexts,
      usage: liveRun.usage
    };
  }

  if (councilMode === "llm-scripted" || provider.kind === "llm_scripted") {
    const llmRun = runScriptedLLMCouncil({
      snapshot,
      toolOutputs,
      personas,
      policyReview,
      scenario: llmScenario as ScriptedLLMScenario,
      budget: llmBudget
    });
    let evalReport = evaluateClaimPackets({
      provider: llmRun.provider,
      snapshot,
      toolOutputs,
      claimPackets: llmRun.claim_packets,
      policyReview,
      expectedPersonas: personas,
      strictActionCeiling: true,
      contextWarnings: llmRun.context_warnings
    });
    if (llmRun.failure) {
      evalReport = finalizeEvalReport({
        ...evalReport,
        passed: false,
        problems: [...evalReport.problems, `Provider failure: ${llmRun.failure}.`]
      });
    }

    return {
      provider: llmRun.provider,
      claim_packets: llmRun.claim_packets,
      eval_report: evalReport,
      contexts: llmRun.contexts,
      usage: llmRun.usage
    };
  }

  const claimPackets = personas.map((personaId) => runPersona(personaId, { snapshot, toolOutputs }));
  const evalReport = evaluateClaimPackets({
    provider,
    snapshot,
    toolOutputs,
    claimPackets,
    policyReview,
    expectedPersonas: personas
  });

  return {
    provider,
    claim_packets: claimPackets,
    eval_report: evalReport
  };
}
