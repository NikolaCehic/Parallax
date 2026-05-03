# Phase 16 Connector Setup Wizards And Guided Readiness Repair

Generated: 2026-05-03T10:00:00Z

## What Was Implemented

Phase 16 turns setup readiness from passive inspection into guided repair. The planner identifies what is complete, needed, or blocked; the apply-next workflow safely scaffolds local control-plane contracts, identity, durable storage, data-vendor replay, and LLM-provider replay. The same workflow is available through CLI, hosted API, and the hosted research console.

## Evidence Artifacts

- initial-repair-status.json/txt: blocked plan from an empty local root.
- api-setup-repair-initial.json: authenticated hosted repair preview.
- api-apply-sequence.json: hosted apply-next convergence sequence.
- api-setup-repair-final.json: final hosted repair status.
- final-repair-status.json/txt: final module status.
- api-control-plane-summary.json: control-plane readiness with setup repair status.
- hosted-console.html and api-console-response.html: generated and served console shells with Guided Repair controls.
- cli-setup-repair-status.txt/json: CLI smoke output.
- redaction-check.json: raw token and raw secret reference checks.
- console-accessibility-check.json: static repair UI checks.
- SPEC_VALIDATION.md: validation against the SPEC slice.

## Test Result

Full suite: npm test -> 66 pass, 0 fail.

## Next Phase

Phase 17 should add persisted onboarding/workspace invitations and user-facing account setup so multiple people can join a repaired workspace without sharing service tokens.
