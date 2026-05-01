export function dossierToMarkdown(dossier) {
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
