# Implementation Status

Status date: 2026-05-02

Parallax has been migrated to a TypeScript + Python prototype that covers the functional intent of the original documented phases, with live execution intentionally limited to sandbox-only approval workflows. The first productization slice is now implemented: product-boundary enforcement plus a local alpha workspace.

TypeScript owns orchestration, contracts, schemas, CLI, council logic, decision gates, lifecycle state, governance, paper trading, and sandbox execution controls.

Python owns deterministic quant-style analytics through `python/parallax_analytics.py`.

Productization owns the product safety kernel, prohibited-claim checks, council-provider evaluation boundary, local data adapters, freshness status, portfolio CSV import, local dossier library, watchlist view, workspace lifecycle alerts, source viewer, portable workspace import/export, static local dashboard, and alpha feedback capture.

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

## Productization Phase Map

| Phase | Status | Evidence |
|---:|---|---|
| 0 Product-Legal Definition | Complete for prototype scope | Product policy, prohibited claims, action ceiling, product boundaries |
| 1 Local Alpha | Complete | Local dashboard, library, watchlist, alerts, feedback, portable import/export, phase artifacts |
| 2 Data-Backed Research App | Complete for local licensed-data-pack scope | Market/fundamental/news/event/corporate-action adapters, portfolio CSV import, freshness dashboard, source viewer upgrades, phase artifacts |
| 3 LLM Council Beta | Next | LLM provider abstraction, prompt/persona registry, adversarial evals |

## What Is Actually Working

- `npm test` builds TypeScript and runs 35 tests, including 10 full E2E synthetic scenarios, CLI human-output coverage, product-boundary tests, council-provider evaluation tests, local workspace tests, Phase 1 local-alpha E2E tests, and Phase 2 data-backed research E2E tests.
- `npm run demo` generates an audit bundle and markdown dossier.
- Every analysis calls the Python analytics worker.
- Every analysis creates a `policy_review` and applies the effective product action ceiling before the decision gate.
- Every analysis records a `council_run` with provider metadata and a claim-packet evaluation report.
- Invalid future LLM-style claim packets can fail before the decision gate through the council evaluation boundary.
- The general product ceiling is capped at `paper_trade_candidate`; live-execution and guaranteed-return framing create policy vetoes.
- CLI analyses now upsert a local `library.json` entry.
- The CLI can list the local library, show a watchlist, scan workspace lifecycle alerts, inspect sources, capture feedback, summarize feedback, export/import the workspace, and generate a local dashboard.
- Phase 1 artifacts live under `artifacts/phase_1_local_alpha/`.
- The evidence layer ingests local licensed data packs with market, fundamentals, news, events, corporate actions, and portfolio data.
- Python analytics produces fundamentals, news provenance, and corporate-action tool outputs when those evidence items are present.
- `data-status` shows freshness, license, source, payload, and stale/restricted data status before analysis.
- `portfolio-import` converts broker-style CSV exports into the local portfolio contract.
- Phase 2 artifacts live under `artifacts/phase_2_data_backed_research_app/`.
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
- No external market data vendor API yet; Phase 2 supports local licensed data packs and vendor-shaped manifests.
- No LLM API integration yet; personas are deterministic and replayable.
- No cloud workspace yet.
- No legal/compliance claim beyond prototype controls.
- No claim of trading profitability.

These limits are not missing implementation details; they are safety boundaries for the current stage.

## Current Acceptance Statement

Within a local prototype scope, the current implementation reaches the intended state:

> I do not know a better architecture for this agent, and I do not know what is structurally wrong with the current one.

The remaining improvements are productization choices: external data vendors, richer analytics, validated model adapters, UI, deployment, and regulated execution review. The product path is documented in [PRODUCTIZATION_PLAN.md](PRODUCTIZATION_PLAN.md).
