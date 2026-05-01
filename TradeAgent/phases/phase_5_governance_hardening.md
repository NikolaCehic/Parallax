# Phase 5: Governance Hardening

## Goal

Turn the prototype into a controlled system with model-risk, monitoring, calibration, release, and review workflows.

## Deliverables

- Model and prompt registry.
- Persona calibration reports.
- Tool validation registry.
- Drift and performance monitoring.
- Veto and override dashboards.
- Audit export.
- Release checklist.
- Incident/runbook drafts.

## Implementation Steps

1. Create model registry.
   - Track model, prompt, persona config, validation status, owner, and release date.

2. Create tool registry.
   - Track deterministic analytics versions, tests, assumptions, and validation status.

3. Add calibration metrics.
   - Persona support/opposition accuracy.
   - Red-team usefulness.
   - Veto frequency.
   - Stale/invalidated thesis rate.
   - Trigger precision and noise.

4. Add monitoring dashboard.
   - Process metrics, not only PnL.

5. Add audit export.
   - Human-readable and machine-readable.

6. Add release controls.
   - Block unvalidated persona, prompt, tool, or schema changes from production config.

7. Add incident runbooks.
   - Data outage.
   - Bad recommendation.
   - Prompt injection.
   - Excess alert noise.
   - Paper/live divergence.

## Test Plan

- Unregistered model/prompt cannot run in governed mode.
- Tool without validation status cannot support central numeric claim.
- Audit export reconstructs decision.
- Calibration reports include paper-trade outcomes and no-trade outcomes.
- Release checklist blocks missing tests.

## Exit Criteria

- System can be reviewed by a model-risk/compliance-minded operator.
- Changes are versioned and controlled.
- Monitoring catches drift and process failures.

## Risks

- Governance becomes paperwork rather than enforcement.
- Dashboards reward action volume instead of quality.
- Calibration overfits small sample sizes.
