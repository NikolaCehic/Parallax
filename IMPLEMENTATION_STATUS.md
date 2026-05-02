# Implementation Status

Status date: 2026-05-01

Parallax has been migrated to a TypeScript + Python prototype that covers the functional intent of all documented phases, with live execution intentionally limited to sandbox-only approval workflows.

TypeScript owns orchestration, contracts, schemas, CLI, council logic, decision gates, lifecycle state, governance, paper trading, and sandbox execution controls.

Python owns deterministic quant-style analytics through `python/parallax_analytics.py`.

## Phase Completion Map

| Phase | Status | Evidence |
|---:|---|---|
| 0 Foundation | Complete | Package scripts, schemas, fixtures, tests, audit primitives |
| 1 Static Dossier MVP | Complete | CLI analysis produces full dossier, claim packets, decision packet, lifecycle, audit |
| 2 Evidence And Analytics | Complete for fixture/local adapter scope | CSV evidence adapter, deterministic analytics, data quality gates |
| 3 Lifecycle Monitor | Complete for deterministic trigger scope | State machine, expiry, freshness, trigger evaluation, monitor CLI |
| 4 Paper Trading Lab | Complete for paper/sim scope | Paper ticket, fill simulation, close, attribution |
| 5 Governance Hardening | Complete for prototype scope | Model/tool registry, release validation, calibration report |
| 6 Permissioned Execution | Complete for sandbox scope | Approval store, pre-trade controls, kill switch, sandbox broker |

## What Is Actually Working

- `npm test` builds TypeScript and runs 23 tests, including 10 full E2E synthetic scenarios and CLI human-output coverage.
- `npm run demo` generates an audit bundle and markdown dossier.
- Every analysis calls the Python analytics worker.
- Stale data vetoes escalation.
- Lifecycle invalidators can move an active thesis to invalidated.
- Expired theses become stale.
- Audit replay verifies bundle integrity.
- Paper tickets cannot be created from watchlist-only dossiers.
- Sandbox submission requires approval and respects the kill switch.
- E2E tests generate arbitrary temporary market, event, and portfolio datasets.
- CLI defaults to step-by-step human-readable reports while preserving `--json` mode for scripts.

## E2E Proof Suite

The E2E suite is documented in [E2E_TESTING.md](E2E_TESTING.md).

It covers:

- clean paper-candidate promotion;
- stale data veto;
- restricted symbol veto;
- concentration veto;
- high-volatility dissent;
- future and past event handling;
- lifecycle invalidation/recheck/expiry;
- paper trade attribution;
- sandbox approval, expiry, kill switch, and risk-control enforcement.

The suite exposed and fixed two issues: past events were previously counted as future event risk, and boolean lifecycle trigger expressions were not evaluated correctly.

## Intentional Limits

- No live broker integration.
- No external market data vendor yet.
- No LLM API integration yet; personas are deterministic and replayable.
- No legal/compliance claim beyond prototype controls.
- No claim of trading profitability.

These limits are not missing implementation details; they are safety boundaries for the current stage.

## Current Acceptance Statement

Within a local prototype scope, the current implementation reaches the intended state:

> I do not know a better architecture for this agent, and I do not know what is structurally wrong with the current one.

The remaining improvements are productization choices: external data vendors, richer analytics, validated model adapters, UI, deployment, and regulated execution review. The product path is documented in [PRODUCTIZATION_PLAN.md](PRODUCTIZATION_PLAN.md).
