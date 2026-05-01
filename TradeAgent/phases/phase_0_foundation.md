# Phase 0: Foundation

## Goal

Create the implementation rails: repo skeleton, schemas, fixture data, validation, tests, and audit-log primitives.

No real market data, no LLM orchestration, and no execution integration are required in this phase.

## Deliverables

- Project skeleton.
- Core schema definitions.
- Fixture evidence dataset.
- Test runner.
- Schema validation tests.
- Audit bundle directory format.
- Developer documentation.

## Suggested Modules

```text
packages/
  schemas/
  evidence_store/
  audit_log/
  shared/
tests/
  fixtures/
  schemas/
```

## Core Schemas

- `NormalizedQuestion`
- `EvidenceItem`
- `EvidenceSnapshot`
- `ToolOutput`
- `PersonaClaimPacket`
- `TradeThesisDossier`
- `DecisionPacket`
- `ThesisTrigger`
- `ThesisLifecycle`
- `AuditBundle`

## Implementation Steps

1. Choose language and validation stack.
   - Recommended: TypeScript with Zod or Python with Pydantic.

2. Create repository skeleton.
   - Keep domain packages separate from app/UI.

3. Implement schemas.
   - Schemas should reject unknown critical fields and invalid enum values.

4. Create fixture dataset.
   - Include one clean thesis, one stale-data thesis, one unsupported-number thesis, and one vetoed thesis.

5. Implement audit bundle writer.
   - Store normalized request, evidence snapshot, tool outputs, persona packets, decision packet, and lifecycle state.

6. Add schema tests.
   - Validate all good fixtures.
   - Reject malformed fixtures.

7. Add deterministic IDs/hashes for persisted objects.

## Test Plan

- Schema accepts valid fixture objects.
- Schema rejects invalid action classes.
- Schema rejects missing provenance on evidence.
- Schema rejects claim packets without evidence references for factual/numeric claims.
- Audit bundle can be written and read back.

## Exit Criteria

- One command validates all fixture schemas.
- Audit bundle format is stable enough for Phase 1.
- No broker, live market data, or autonomous execution code exists.

## Risks

- Overbuilding infrastructure before proving the dossier loop.
- Letting schemas become too loose.
- Creating a repo shape that makes deterministic replay hard later.
