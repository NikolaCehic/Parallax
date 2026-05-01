import { assertPersonaClaimPacket } from "../core/schemas.js";
import { PERSONAS, runPersona } from "./personas.js";

export function runCouncil({ snapshot, toolOutputs, personas = PERSONAS }) {
  const claimPackets = personas.map((personaId) => runPersona(personaId, { snapshot, toolOutputs }));
  claimPackets.forEach((packet) => assertPersonaClaimPacket(packet));
  return claimPackets;
}

export function crossExamine(claimPackets) {
  const vetoes = claimPackets.filter((packet) => packet.veto.active);
  const unsupported = claimPackets.filter((packet) => packet.required_checks?.length > 0);
  const redTeam = claimPackets.find((packet) => packet.persona_id === "red_team_skeptic");
  const opposed = claimPackets.filter((packet) => packet.stance === "oppose");

  return {
    veto_count: vetoes.length,
    opposed_personas: opposed.map((packet) => packet.persona_id),
    required_checks: [...new Set(unsupported.flatMap((packet) => packet.required_checks ?? []))],
    red_team_summary: redTeam?.thesis ?? "",
    unresolved_dissent: opposed.length > 0 || vetoes.length > 0
  };
}

export function synthesizeDossierSummary({ claimPackets, crossExamination }) {
  const support = claimPackets.filter((packet) => packet.stance === "support");
  const opposition = claimPackets.filter((packet) => packet.stance === "oppose");
  const needsData = claimPackets.filter((packet) => packet.stance === "needs_more_data");
  const analyticalSupport = support.filter((packet) => ![
    "data_quality_officer",
    "compliance_conflicts_officer",
    "model_validator"
  ].includes(packet.persona_id));

  return {
    council_summary: `${support.length} support, ${opposition.length} oppose, ${needsData.length} need more data.`,
    strongest_bull_case: (analyticalSupport.length ? analyticalSupport : support).sort((a, b) => b.confidence - a.confidence)[0]?.thesis ?? "No strong bull case.",
    strongest_bear_case: opposition.sort((a, b) => b.confidence - a.confidence)[0]?.thesis ?? crossExamination.red_team_summary,
    dissent: crossExamination.opposed_personas,
    required_checks: crossExamination.required_checks,
    assumptions: [...new Set(claimPackets.flatMap((packet) => packet.assumptions ?? []))],
    invalidators: [...new Set(claimPackets.flatMap((packet) => packet.invalidators ?? []))],
    risks: [...new Set(claimPackets.flatMap((packet) => packet.risks ?? []))]
  };
}
