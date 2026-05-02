# Implementation Status

Status date: 2026-05-02

Parallax has been migrated to a TypeScript + Python prototype that covers the functional intent of the original documented phases, with direct live execution intentionally locked behind partner-only control boundaries. The productized prototype now includes product-boundary enforcement, local workspace workflows, team governance, partner-execution controls, a beta deployment surface, and managed SaaS scaffolding.

TypeScript owns orchestration, contracts, schemas, CLI, council logic, decision gates, lifecycle state, governance, paper trading, sandbox execution controls, partner-execution controls, the beta API/deployment layer, and managed SaaS control-plane scaffolding.

Python owns deterministic quant-style analytics through `python/parallax_analytics.py`.

Productization owns the product safety kernel, prohibited-claim checks, council-provider evaluation boundary, local data adapters, freshness status, portfolio CSV import, local dossier library, watchlist view, workspace lifecycle alerts, source viewer, portable workspace import/export, static local dashboard, alpha feedback capture, prompt/persona/provider registries, scripted LLM council safety evals, custom lifecycle trigger overlays, alert preferences, change-since-last-run state, local notifications, the persistent paper trading lab, the local team governance ledger, the partner-execution ledger, beta deployment readiness, and managed SaaS readiness.

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
| 3 LLM Council Beta | Complete for local scripted-provider scope | LLM provider abstraction, prompt/persona/provider registry, evidence-only contexts, adversarial evals, cost controls, phase artifacts |
| 4 Lifecycle And Alerts | Complete for local workspace scope | Trigger editor, alert preferences, persisted change-since-last-run checks, notification inbox, lifecycle dashboard upgrades, phase artifacts |
| 5 Paper Trading Lab | Complete for local simulation scope | Paper ledger, risk reservation, fill assumptions, open/closed views, attribution, review notes, calibration, phase artifacts |
| 6 Team And Governance | Complete for local team workspace scope | Role directory, review assignments, comments, approvals, release readiness controls, governance export, SOC 2 readiness program, phase artifacts |
| 7 Regulated/Partner Execution | Complete for partner sandbox handoff and locked production-adapter scope | Regulated partner registry, legal/compliance approval, market-access review, persistent partner tickets, human approval, kill switch, partner sandbox handoff, production lock, post-trade review, phase artifacts |
| 8 Product Beta And Deployment | Complete for local beta deployment scope | Hashed API token config, readiness report, authenticated beta API, dashboard endpoint, Docker scaffold, beta export package, phase artifacts |
| 9 Managed SaaS And External Integrations | Complete for managed beta scaffold scope | Tenant isolation, external secret references, external provider manifests, observability event log, readiness/export package, phase artifacts |

## What Is Actually Working

- `npm test` builds TypeScript and runs 52 tests, including 10 full E2E synthetic scenarios, CLI human-output coverage, product-boundary tests, council-provider evaluation tests, local workspace tests, Phase 1 local-alpha E2E tests, Phase 2 data-backed research E2E tests, Phase 3 LLM council safety tests, Phase 4 lifecycle-alert tests, Phase 5 paper-lab tests, Phase 6 team-governance tests, Phase 7 partner-execution tests, Phase 8 beta-deployment tests, and Phase 9 managed-SaaS tests.
- `npm run demo` generates an audit bundle and markdown dossier.
- Every analysis calls the Python analytics worker.
- Every analysis creates a `policy_review` and applies the effective product action ceiling before the decision gate.
- Every analysis records a `council_run` with provider metadata and a claim-packet evaluation report.
- Invalid future LLM-style claim packets can fail before the decision gate through the council evaluation boundary.
- `llm-scripted` mode builds evidence-only context windows, tracks token/cost budget, stores context hashes, and remains replayable without cloud credentials.
- `llm-eval` rejects hallucinated references, unsupported calculations, hidden recommendation language, prompt-injection obedience, and cost overruns.
- `prompt-registry` exposes prompt, persona, and provider registry state for governance review.
- `trigger-add` writes custom lifecycle triggers as replay-safe local overrides.
- `alert-prefs` manages local alert channels, muted symbols, and freshness thresholds.
- `alerts` now reports change since last run and writes local notifications.
- `notifications` reads the local lifecycle inbox.
- `paper-open` reserves paper risk budget and opens a simulated filled trade from an audit-backed dossier.
- `paper-close` closes a simulated trade and records attribution.
- `paper-ledger` summarizes open/closed trades, PnL, calibration, and simulation-only boundaries.
- `paper-review` records human process notes against a paper outcome.
- `team-init` creates a local team workspace ledger.
- `team-member-add` records role-bound reviewers.
- `team-assign`, `team-comment`, and `team-approve` create review discipline around a dossier.
- `team-report` combines human approvals, model/tool registry validation, release readiness, and SOC 2-style control status.
- `team-export` writes a portable governance package.
- `partner-register` records a regulated partner sandbox or locked production-adapter boundary.
- `partner-legal-approve` records legal/compliance approval.
- `partner-market-review` records market-access limits.
- `partner-ticket`, `partner-approve`, `partner-controls`, and `partner-submit` enforce partner handoff controls.
- `partner-kill-switch` blocks partner submission.
- `partner-post-review` records post-trade review.
- `partner-report` summarizes execution controls, submissions, regulatory source anchors, and production-lock status.
- `beta-init` creates a beta deployment config that stores only a token hash.
- `beta-readiness` checks auth, product boundaries, locked production, provider status, registry availability, dashboard generation, and export readiness.
- `beta-status` summarizes the workspace for API consumers.
- `beta-serve` starts an authenticated local API and dashboard server.
- `beta-export` writes a beta deployment package plus workspace export.
- `saas-init` creates a managed SaaS control-plane config.
- `tenant-create` creates isolated tenant audit directories under the managed root.
- `secret-ref-add` records external secret-manager references and hashes without storing raw secrets.
- `integration-add` records disabled-until-configured external provider manifests for identity, market data, LLM, regulated partner, storage, and observability.
- `observability-record` appends managed control-plane events to a JSONL audit stream.
- `saas-readiness`, `saas-status`, and `saas-export` report and package managed readiness evidence.
- The general product ceiling is capped at `paper_trade_candidate`; live-execution and guaranteed-return framing create policy vetoes.
- CLI analyses now upsert a local `library.json` entry.
- The CLI can list the local library, show a watchlist, scan workspace lifecycle alerts, inspect sources, capture feedback, summarize feedback, export/import the workspace, and generate a local dashboard.
- Phase 1 artifacts live under `artifacts/phase_1_local_alpha/`.
- The evidence layer ingests local licensed data packs with market, fundamentals, news, events, corporate actions, and portfolio data.
- Python analytics produces fundamentals, news provenance, and corporate-action tool outputs when those evidence items are present.
- `data-status` shows freshness, license, source, payload, and stale/restricted data status before analysis.
- `portfolio-import` converts broker-style CSV exports into the local portfolio contract.
- Phase 2 artifacts live under `artifacts/phase_2_data_backed_research_app/`.
- Phase 3 artifacts live under `artifacts/phase_3_llm_council_beta/`.
- Phase 4 artifacts live under `artifacts/phase_4_lifecycle_alerts/`.
- Phase 5 artifacts live under `artifacts/phase_5_paper_trading_lab/`.
- Phase 6 artifacts live under `artifacts/phase_6_team_and_governance/`.
- Phase 7 artifacts live under `artifacts/phase_7_regulated_partner_execution/`.
- Phase 8 artifacts live under `artifacts/phase_8_product_beta_deployment/`.
- Phase 9 artifacts live under `artifacts/phase_9_managed_saas_external_integrations/`.
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
- sandbox approval, expiry, kill switch, and risk-control enforcement;
- partner legal approval, market-access review, human approval, kill switch, production-adapter lock, post-trade review, and workspace portability.
- managed SaaS tenant isolation, secret-reference hygiene, external provider manifests, observability events, readiness status, and export packaging.

The suite exposed and fixed two issues: past events were previously counted as future event risk, and boolean lifecycle trigger expressions were not evaluated correctly.

## Intentional Limits

- No direct live broker integration.
- Partner production adapter is locked by default and requires a separately approved regulated partner implementation.
- No external market data vendor API yet; Phase 2 supports local licensed data packs, and Phase 9 records external vendor manifests.
- No external LLM API integration yet; the current LLM path is a deterministic local harness that exercises the production contract.
- No cloud workspace yet; Phase 8 provides a local beta API/deployment scaffold, and Phase 9 provides a local managed SaaS control-plane scaffold.
- No external SSO provider yet; beta auth uses bearer tokens and stores only token hashes, while Phase 9 records identity-provider manifests.
- No legal/compliance claim beyond prototype controls.
- No claim of trading profitability.

These limits are not missing implementation details; they are safety boundaries for the current stage.

## Current Acceptance Statement

Within a local prototype scope, the current implementation reaches the intended state:

> I do not know a better architecture for this agent, and I do not know what is structurally wrong with the current one.

The remaining improvements are productization choices: external data vendors, richer analytics, external validated model adapters, a richer hosted UI, real cloud identity/SSO, managed storage, and real regulated partner integration. The product path is documented in [PRODUCTIZATION_PLAN.md](PRODUCTIZATION_PLAN.md).
