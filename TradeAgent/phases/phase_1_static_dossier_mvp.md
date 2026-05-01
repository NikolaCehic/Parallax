# Phase 1: Static Dossier MVP

## Goal

Produce the first complete Trade Thesis Dossier from fixture evidence and mocked deterministic tool outputs.

The system should prove the core loop:

```text
intake -> evidence snapshot -> tool outputs -> council -> synthesis -> decision gate -> lifecycle assignment -> audit bundle
```

## Deliverables

- Intake parser for structured test requests.
- Fixture evidence snapshot loader.
- Mock analytics outputs.
- Six MVP personas.
- Council runner.
- Cross-examination pass.
- Dossier synthesizer.
- Decision gate.
- Basic lifecycle assignment.
- Replay command.

## MVP Personas

1. Quant Researcher
2. Fundamental Analyst
3. Technical and Microstructure Analyst
4. Portfolio Risk Manager
5. Compliance and Conflicts Officer
6. Red Team Skeptic

## Implementation Steps

1. Implement `analyze` command.
   - Inputs: symbol, horizon, thesis, optional portfolio profile.

2. Load fixture evidence.
   - Freeze evidence snapshot and assign hash.

3. Load mocked tool outputs.
   - Each number used by personas must come from a `ToolOutput`.

4. Run independent persona passes.
   - Each persona receives the same evidence and tool packet.
   - Persona output must match `PersonaClaimPacket`.

5. Run cross-examination.
   - Red Team challenges assumptions.
   - Risk and Compliance can activate vetoes.

6. Synthesize dossier.
   - Preserve bull case, bear case, dissent, assumptions, invalidators, and required checks.

7. Apply decision gate.
   - Enforce hard vetoes.
   - Enforce MVP action ceiling: `watchlist`.

8. Assign lifecycle state.
   - Default states: `active`, `stale`, or `invalidated`.
   - Generate static triggers.

9. Persist audit bundle.

10. Implement replay.
   - Frozen bundle should reconstruct the same decision packet.

## Test Plan

- Clean thesis produces a watchlist dossier.
- Stale data produces downgrade or veto.
- Unsupported central numeric claim is rejected.
- Red-team critique appears in the final dossier.
- Compliance veto blocks escalation.
- Replay produces identical decision packet.
- Action ceiling prevents paper or order candidate output.

## Exit Criteria

- A complete dossier can be generated from fixtures.
- Every persona packet validates.
- Decision packet validates.
- Lifecycle assignment exists.
- Audit replay passes.

## Risks

- Persona outputs become narrative instead of structured.
- Synthesis hides dissent.
- Mocked analytics make the system look smarter than it is.
