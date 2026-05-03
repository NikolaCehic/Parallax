# Implementation Status

Status date: 2026-05-03

Parallax has been migrated to a TypeScript + Python prototype that covers the functional intent of the original documented phases, with direct live execution intentionally locked behind partner-only control boundaries. The productized prototype now includes product-boundary enforcement, local workspace workflows, team governance, partner-execution controls, a beta deployment surface, managed SaaS scaffolding, a local hosted multi-tenant API, identity/storage foundation contracts, an external data vendor boundary, an external LLM provider boundary, and workspace invitation onboarding.

TypeScript owns orchestration, contracts, schemas, CLI, council logic, decision gates, lifecycle state, governance, paper trading, sandbox execution controls, partner-execution controls, the beta API/deployment layer, managed SaaS control-plane scaffolding, tenant persistence, hosted API serving, local identity sessions, durable storage manifests, external data vendor import contracts, external LLM provider replay contracts, and workspace invitation/account onboarding.

Python owns deterministic quant-style analytics through `python/parallax_analytics.py`.

Productization owns the product safety kernel, prohibited-claim checks, council-provider evaluation boundary, local data adapters, freshness status, portfolio CSV import, local dossier library, watchlist view, workspace lifecycle alerts, source viewer, portable workspace import/export, static local dashboard, alpha feedback capture, prompt/persona/provider registries, scripted LLM council safety evals, custom lifecycle trigger overlays, alert preferences, change-since-last-run state, local notifications, the persistent paper trading lab, the local team governance ledger, the partner-execution ledger, beta deployment readiness, managed SaaS readiness, provider contract validation, hosted console foundation, tenant persistence, hosted multi-tenant API readiness, identity-session readiness, durable-storage readiness, data-vendor boundary readiness, LLM-provider boundary readiness, hosted research console readiness, guided connector repair readiness, and workspace onboarding readiness.

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
| 10 Provider Validation And Hosted Console | Complete for provider-contract beta scope | Provider contract checks, sanitized validation report, blocked-manifest checks, hosted console HTML, phase artifacts |
| 11 Hosted Multi-Tenant API And Persistence | Complete for local hosted API scope | Tenant state/event persistence, hosted API readiness, authenticated tenant-scoped HTTP routes, cross-tenant blocking, phase artifacts |
| 12 Cloud Identity And Durable Storage Foundation | Complete for local foundation scope | Hash-only identity sessions, scoped tenant API access, durable storage object manifests, checkpoints, hosted foundation readiness, phase artifacts |
| 13 External Data Vendor Adapter Boundary | Complete for local vendor replay scope | Licensed adapter registry, tenant-scoped data pack import, provenance hashes, hosted import routes, unsafe data-dir blocking, phase artifacts |
| 14 External LLM Provider Adapter Boundary | Complete for local model replay scope | Replay-only model adapter registry, provider-specific eval suite, evidence-only contexts, hosted replay analysis, unsafe data-dir blocking, phase artifacts |
| 15 Hosted Research Console UX And Onboarding | Complete for local hosted console scope | Research console shell, onboarding checklist, readiness rails, tenant analysis form, tenant library panes, control-plane overview, phase artifacts |
| 16 Connector Setup Wizards And Guided Readiness Repair | Complete for local guided-repair scope | Repair planner, apply-next workflow, hosted API route, console controls, CLI commands, convergence/redaction tests, phase artifacts |
| 17 Workspace Invitations And User Account Onboarding | Complete for local onboarding scope | Hash-only invitations, public invite acceptance, scoped identity-session issuance, hosted API routes, console controls, CLI commands, redaction tests, phase artifacts |

## What Is Actually Working

- `npm test` builds TypeScript and runs 68 tests, including 10 full E2E synthetic scenarios, CLI human-output coverage, product-boundary tests, council-provider evaluation tests, local workspace tests, Phase 1 local-alpha E2E tests, Phase 2 data-backed research E2E tests, Phase 3 LLM council safety tests, Phase 4 lifecycle-alert tests, Phase 5 paper-lab tests, Phase 6 team-governance tests, Phase 7 partner-execution tests, Phase 8 beta-deployment tests, Phase 9 managed-SaaS tests, Phase 10 provider/hosted-console tests, Phase 11 hosted API tests, Phase 12 identity/storage tests, Phase 13 data-vendor tests, Phase 14 LLM-provider tests, Phase 15 hosted-console tests, Phase 16 guided-repair tests, and Phase 17 onboarding tests.
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
- `provider-validate` writes a sanitized provider contract validation report.
- `provider-status` computes provider contract status without persisting a report.
- `hosted-console` writes a hosted research console with onboarding, readiness rails, provider/data/model boundary status, an authenticated analysis form, and tenant library/event panes.
- `setup-repair-status` and `setup-repair-apply` preview and apply local guided setup repairs without storing raw secrets or enabling external networks.
- `onboarding-status`, `invite-create`, and `invite-accept` report onboarding readiness, create hash-only invitations, and accept invitations into scoped identity sessions.
- `hosted-api-status` reports provider, tenant persistence, auth, and production-lock readiness for the hosted API.
- `tenant-persistence` summarizes tenant state/event/dossier counts and path isolation.
- `tenant-state-set` writes tenant-scoped state while rejecting secret-like payloads.
- `hosted-serve` starts an authenticated local hosted API with tenant-scoped status, state, event, library, analysis, control-plane, readiness, health, and console routes.
- `identity-init`, `identity-principal-add`, `identity-session-issue`, and `identity-status` create a local identity directory, role/scopes, and hash-only session evidence.
- `storage-init`, `storage-object-put`, `storage-checkpoint`, and `storage-status` create a durable-storage manifest, tenant-scoped object writes, and checkpoint evidence.
- `hosted-foundation-status` validates hosted API, identity, durable storage, token redaction, and no-live-cloud/no-live-broker boundaries together.
- `data-vendor-register`, `data-vendor-import`, and `data-vendor-status` register licensed market-data adapter contracts, import tenant-scoped vendor packs, and validate provenance/license/freshness boundaries.
- `llm-provider-register`, `llm-provider-analyze`, and `llm-provider-status` register replay-only model adapter contracts, run provider-specific evals, create evidence-only replay dossiers, and validate budget/secret/network boundaries.
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
- Phase 10 artifacts live under `artifacts/phase_10_provider_validation_hosted_console/`.
- Phase 11 artifacts live under `artifacts/phase_11_hosted_multi_tenant_api/`.
- Phase 12 artifacts live under `artifacts/phase_12_identity_storage_foundation/`.
- Phase 13 artifacts live under `artifacts/phase_13_external_data_vendor_boundary/`.
- Phase 14 artifacts live under `artifacts/phase_14_external_llm_provider_boundary/`.
- Phase 15 artifacts live under `artifacts/phase_15_hosted_research_console/`.
- Phase 16 artifacts live under `artifacts/phase_16_connector_setup_repair/`.
- Phase 17 artifacts live under `artifacts/phase_17_workspace_invitations_onboarding/`.
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
- provider contract validation, blocked provider manifests, raw-secret redaction, hosted-console generation, and CLI smoke coverage.
- hosted API readiness, tenant state/event persistence, HTTP auth, cross-tenant blocking, tenant-scoped analysis/library separation, hosted-console serving, secret-payload rejection, and CLI smoke coverage.
- identity directory readiness, hash-only identity sessions, role/scope enforcement, tenant-scoped session access, durable storage object manifests, checkpoint evidence, secret-payload rejection, and hosted foundation readiness.
- data vendor adapter registration, market-data provider contract readiness, tenant-scoped imported data packs, provenance hashes, restricted-license blocking, symbol allow-list enforcement, unsafe `data_dir` denial, and hosted import coverage.
- external LLM provider adapter registration, LLM provider contract readiness, provider-specific eval suite, evidence-only replay contexts, hosted replay analysis, unsafe `data_dir` denial, secret-payload rejection, and model-network disablement.
- hosted research console rendering, setup checklist coverage, readiness rail coverage, authenticated hosted console route, control-plane overview payload, live hosted analysis, tenant library refresh path, and redaction checks.
- guided connector repair planning, apply-next convergence, hosted API repair routes, console repair controls, CLI smoke coverage, and redaction checks.
- workspace invitation creation, public invite acceptance without the service token, hash-only invite/session persistence, accepted-session tenant API access, duplicate-accept blocking, console onboarding controls, and CLI smoke coverage.

The suite exposed and fixed two issues: past events were previously counted as future event risk, and boolean lifecycle trigger expressions were not evaluated correctly.

## Intentional Limits

- No direct live broker integration.
- Partner production adapter is locked by default and requires a separately approved regulated partner implementation.
- No live external market data vendor network call yet; Phase 2 supports local licensed data packs, Phase 9 records external vendor manifests, Phase 12 adds identity/storage contracts, and Phase 13 imports vendor-shaped local replay packs under strict license/provenance gates.
- No live external LLM API call yet; Phase 3 has a deterministic local harness, Phase 12 validates model-provider manifests, and Phase 14 adds replay-only external-model adapter contracts plus eval gates before any real model networking.
- No cloud workspace yet; Phase 8 provides a local beta API/deployment scaffold, Phase 9 provides a local managed SaaS control-plane scaffold, Phase 10 provides a static hosted console foundation, Phase 11 provides a local hosted multi-tenant API, Phase 12 provides local identity/storage contracts, Phase 15 provides a local hosted research console, Phase 16 provides local guided setup repair, and Phase 17 provides local invitation onboarding.
- No external SSO provider yet; beta and hosted APIs use bearer tokens and store only token hashes, while Phase 17 adds hash-only invitations, local identity sessions, and identity-provider manifest validation locally.
- No legal/compliance claim beyond prototype controls.
- No claim of trading profitability.

These limits are not missing implementation details; they are safety boundaries for the current stage.

## Current Acceptance Statement

Within a local prototype scope, the current implementation reaches the intended state:

> I do not know a better architecture for this agent, and I do not know what is structurally wrong with the current one.

The remaining improvements are productization choices: live external data vendors, richer analytics, live external validated model adapters, a richer hosted UI, real cloud identity/SSO, managed cloud storage, and real regulated partner integration. The product path is documented in [PRODUCTIZATION_PLAN.md](PRODUCTIZATION_PLAN.md).
