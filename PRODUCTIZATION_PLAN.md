# Parallax Productization Plan

Status: Productization blueprint  
Date: 2026-05-02  
Goal: Turn Parallax from a local prototype into a viable product other people can safely use.

## Executive Summary

Parallax should become a **governed trading-thesis research platform**, not a live trading bot and not a signal service.

The best product wedge is:

> A tool that helps analysts, active investors, and small teams turn a trade idea into an evidence-linked, adversarially reviewed, auditable thesis dossier with lifecycle monitoring.

The product should not begin by telling users what to buy. It should begin by helping users think better, document better, monitor better, and avoid unsupported conviction.

The safest and strongest commercial path is:

1. local/private alpha for power users;
2. cloud research workspace for teams;
3. paper-trading and calibration lab;
4. compliance/governance package;
5. only later, permissioned execution through regulated partners.

## Product Positioning

### What Parallax Is

Parallax is a thesis-analysis agent.

It accepts:

- a ticker or asset;
- a time horizon;
- a user-supplied thesis;
- portfolio/account constraints, if available;
- market, event, and data context.

It outputs:

- a Trade Thesis Dossier;
- action class;
- council review;
- bull/bear cases;
- risks and invalidators;
- hard vetoes;
- lifecycle triggers;
- audit trail.

### What Parallax Is Not

Parallax should not initially be positioned as:

- an AI stock picker;
- an automated trading system;
- a broker;
- a registered adviser substitute;
- a guaranteed-alpha tool;
- a personalized recommendation engine for retail investors;
- a product that can replace judgment, compliance, or risk review.

### Recommended Public Description

> Parallax is a research accountability platform for trading ideas. It turns a thesis into a structured dossier, checks the evidence, challenges assumptions, surfaces risks, and monitors invalidation triggers over time.

## Core Product Rule

The first productized version should keep this ceiling:

```text
no_trade
research_needed
watchlist
paper_trade_candidate
```

Do not ship live execution as a general feature.

Live execution should exist only as a later enterprise/regulated-partner workflow with:

- explicit human approval;
- pre-trade risk checks;
- broker-side controls;
- kill switch;
- compliance review;
- post-trade review;
- legal sign-off.

## Current Prototype Strengths

The current repo already has the right skeleton:

- TypeScript orchestration;
- Python deterministic analytics;
- human-readable CLI;
- JSON mode;
- evidence snapshots;
- 12 council roles;
- decision gates;
- lifecycle engine;
- audit replay;
- paper-trading helpers;
- sandbox execution controls;
- scripted LLM council harness;
- lifecycle alert workspace;
- paper trading lab ledger;
- team governance ledger;
- partner execution ledger;
- beta deployment/API layer;
- managed SaaS control-plane scaffold;
- provider contract validation harness;
- hosted console foundation;
- hosted multi-tenant API and tenant persistence;
- 56 tests;
- 10 synthetic E2E scenarios.

This foundation should be kept. The next work is not a rewrite. It is product hardening.

## Implementation Progress

Implemented on 2026-05-02:

- product-boundary policy module;
- prohibited-claim detection;
- effective action-ceiling enforcement before the decision gate;
- policy vetoes for blocked live-execution or guaranteed-return framing;
- `policy_review` in every dossier;
- council provider/evaluation boundary;
- `council_run` in every dossier;
- CLI `policy` command;
- local dossier library;
- watchlist view;
- workspace lifecycle alerts;
- evidence/source viewer;
- alpha feedback capture;
- feedback summary;
- portable workspace import/export;
- static local dashboard;
- Phase 1 artifact bundle;
- local licensed data-pack adapters;
- fundamentals/news/corporate-action analytics;
- portfolio CSV import;
- data freshness status;
- source viewer payload summaries;
- Phase 2 artifact bundle;
- LLM provider abstraction;
- prompt/persona/provider registry;
- evidence-only LLM context windows;
- adversarial LLM eval suite;
- cost controls for model-style runs;
- Phase 3 artifact bundle;
- custom lifecycle trigger overlays;
- alert preference manager;
- change-since-last-run monitor state;
- local notification inbox;
- lifecycle dashboard upgrades;
- Phase 4 artifact bundle;
- paper ledger and risk reservation;
- paper open/close/review CLI workflow;
- paper attribution and calibration summary;
- paper dashboard section;
- Phase 5 artifact bundle;
- team workspace ledger;
- role-aware review assignments;
- comments and approvals;
- release readiness controls;
- governance export package;
- SOC 2 readiness program;
- Phase 6 artifact bundle;
- partner registry;
- legal/compliance approval records;
- market-access review records;
- partner tickets and human approvals;
- partner sandbox handoff;
- production-adapter lock;
- post-trade review records;
- Phase 7 artifact bundle;
- beta deployment config;
- authenticated local beta API;
- readiness checks;
- Docker deployment scaffold;
- beta export package;
- Phase 8 artifact bundle;
- managed SaaS control-plane config;
- tenant isolation model;
- external secret-reference registry;
- external provider manifests for SSO, market data, LLM, regulated partner, and observability;
- managed observability event log;
- managed SaaS readiness/status/export package;
- Phase 9 artifact bundle;
- provider contract validation report;
- hosted console generator;
- Phase 10 artifact bundle;
- hosted API readiness report;
- tenant state/event persistence;
- authenticated tenant-scoped hosted API;
- Phase 11 artifact bundle;
- 56 passing tests.

## Knowledge Gathered

This plan is grounded in the following constraints and frameworks.

### AI Risk And Model Governance

NIST AI RMF and its Generative AI Profile support a govern/map/measure/manage pattern for AI risk management. Parallax should treat each persona, prompt, model, and analytics tool as governed components with validation, monitoring, and audit trails.

Sources:

- [NIST AI Risk Management Framework](https://www.nist.gov/itl/ai-risk-management-framework)
- [NIST AI RMF Generative AI Profile](https://www.nist.gov/itl/ai-risk-management-framework)

### Model Risk Management

SR 11-7 frames model risk as the risk of adverse consequences from incorrect or misused model outputs. Parallax should adopt SR 11-7-style controls even if not legally required: model inventory, validation, monitoring, change control, and independent review.

Source:

- [Federal Reserve SR 11-7: Model Risk Management](https://www.federalreserve.gov/bankinforeg/srletters/sr1107.htm)

### Broker/Adviser And Trading Controls

FINRA and SEC sources imply that product behavior, communications, recommendations, conflicts, supervision, and execution access matter deeply. Even if Parallax starts as a research tool, the product must be designed so it does not accidentally become ungoverned investment advice or unapproved market access.

Sources:

- [FINRA Regulatory Notice 24-09 on GenAI/LLMs](https://www.finra.org/rules-guidance/notices/24-09)
- [SEC Market Access Rule 15c3-5 overview](https://www.sec.gov/rules-regulations/2011/06/risk-management-controls-brokers-or-dealers-market-access)
- [SEC Regulation Best Interest FAQ](https://www.sec.gov/rules-regulations/staff-guidance/trading-markets-frequently-asked-questions/faq-regulation-best)
- [FINRA Rule 2210, Communications with the Public](https://www.finra.org/rules-guidance/rulebooks/finra-rules/2210)
- [SEC Investment Adviser Marketing](https://www.sec.gov/investment/investment-adviser-marketing)
- [SEC PDA conflicts rule page, showing 2025 withdrawal of proposed rule S7-12-23](https://www.sec.gov/rules-regulations/2023/07/s7-12-23)

### Cybersecurity And Agent Security

Parallax is an agentic AI product with financial data. It needs secure-by-design architecture, threat modeling, least privilege, prompt-injection defenses, tenant isolation, and auditability.

Sources:

- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)
- [CISA Secure by Design](https://www.cisa.gov/securebydesign)
- [OWASP Top 10 for LLM Applications 2025](https://github.com/OWASP/www-project-top-10-for-large-language-model-applications/)
- [OWASP Top 10 for Agentic Applications 2026](https://genai.owasp.org/resource/owasp-top-10-for-agentic-applications-for-2026/)

### Privacy

Parallax may process portfolio holdings, trading history, preferences, and sensitive research. Privacy controls must be built early: data minimization, clear retention, deletion, tenancy boundaries, and explicit user control over what is stored.

Source:

- [NIST Privacy Framework](https://www.nist.gov/privacy-framework)

### Truthful AI Claims

AI product marketing must be accurate. Do not claim Parallax predicts markets, guarantees returns, replaces advisers, or autonomously validates all facts. Claims must match the actual product behavior.

Source:

- [FTC Operation AI Comply](https://consumer.ftc.gov/consumer-alerts/2024/09/operation-ai-comply-detecting-ai-infused-frauds-and-deceptions)

## Recommended Product Strategy

### Beachhead Market

Start with:

- serious self-directed investors;
- independent analysts;
- small research teams;
- trading educators;
- boutique funds that want better thesis discipline;
- professionals who already understand that this is research support, not a recommendation engine.

Avoid starting with:

- mass-market retail “what should I buy?” users;
- automated trading users;
- performance-seeking signal subscribers;
- anyone expecting guaranteed returns.

### Product Wedge

The wedge should be:

> Trade Thesis Dossiers with evidence, dissent, invalidators, and lifecycle monitoring.

This is clearer and safer than:

> AI trading signals.

### Packaging

1. **Parallax Local**
   - Desktop/local-first.
   - User controls their data.
   - Good for alpha users and credibility.

2. **Parallax Cloud**
   - Hosted workspace.
   - Accounts, saved dossiers, watchlists, alerts.
   - Good for teams and subscriptions.

3. **Parallax Pro**
   - More data integrations.
   - Portfolio context.
   - Paper-trade lab.
   - Team collaboration.

4. **Parallax Governance**
   - Audit exports.
   - Model/tool registry.
   - Review workflows.
   - Compliance package.

5. **Parallax Execution Partner**
   - Not a default product.
   - Only through regulated broker/adviser partner workflows.

## Product Requirements For Viability

### User Experience

The product needs a UI, not only a CLI.

Minimum usable app:

- dashboard;
- new thesis flow;
- dossier view;
- council view;
- evidence/source view;
- invalidator editor;
- watchlist;
- lifecycle alerts;
- paper-trade lab;
- audit export.

The best first UI is a desktop-style web app:

- React/Next.js or similar frontend;
- TypeScript API backend;
- Python analytics services;
- local-first mode possible;
- later hosted SaaS.

### Dossier Experience

Every dossier should show:

- what was asked;
- what data was used;
- what calculations were run;
- what the council concluded;
- strongest bull case;
- strongest bear case;
- what would prove the thesis wrong;
- whether the thesis is active, stale, invalidated, or upgraded;
- why the action class was chosen;
- how to recheck it.

### User Trust Features

Users should be able to click:

- “show evidence”;
- “show calculation”;
- “show dissent”;
- “why not paper trade?”;
- “what changed since last run?”;
- “what would invalidate this?”;
- “export audit bundle.”

## Productized Architecture

### Target Architecture

```text
Frontend App
  -> TypeScript API
  -> Evidence Service
  -> Python Analytics Workers
  -> LLM/Persona Orchestrator
  -> Decision Gate
  -> Lifecycle Monitor
  -> Audit/Event Store
  -> Notification Service
  -> Paper Trading Lab
```

### Core Services

1. **Identity And Workspace Service**
   - accounts;
   - workspaces;
   - roles;
   - API keys;
   - tenant isolation.

2. **Evidence Service**
   - data adapters;
   - provenance;
   - freshness;
   - licenses;
   - snapshots;
   - corporate actions;
   - event calendars.

3. **Analytics Service**
   - Python workers;
   - versioned calculations;
   - validated metrics;
   - backtests;
   - stress tests;
   - factor exposure.

4. **Council Service**
   - persona definitions;
   - LLM adapters;
   - prompt registry;
   - tool permissions;
   - claim packet validation.

5. **Decision Gate**
   - hard vetoes;
   - action ceilings;
   - risk checks;
   - compliance checks;
   - confidence/freshness caps.

6. **Lifecycle Monitor**
   - trigger evaluator;
   - state machine;
   - stale/invalidated/upgraded transitions;
   - alert scheduling;
   - replay of market changes.

7. **Audit/Event Store**
   - immutable event log;
   - evidence hashes;
   - tool outputs;
   - persona packets;
   - decisions;
   - user approvals;
   - exports.

8. **Paper Trading Lab**
   - simulated tickets;
   - fill assumptions;
   - position tracking;
   - attribution;
   - calibration.

9. **Governance Console**
   - model registry;
   - tool registry;
   - prompt registry;
   - validation reports;
   - incident log;
   - release controls.

## Data Strategy

### Data Needed For Product Viability

Start with one asset class.

Recommended first asset class:

```text
US equities and ETFs
```

Required data:

- OHLCV market data;
- corporate actions;
- fundamentals;
- earnings calendar;
- news/events;
- sector/industry mapping;
- ETF/factor proxies;
- portfolio holdings import;
- benchmark data;
- optional options/volatility data later.

### Data Principles

- Every data point needs source, timestamp, license, and freshness.
- Never mix live data and stale data without marking it.
- Never allow unlicensed data into shared product outputs.
- Cache snapshots for replay.
- Make vendor disagreement visible.
- Treat external text as untrusted input.

### Vendor Strategy

Do not hard-code the product around one vendor.

Build adapters:

```text
MarketDataAdapter
FundamentalsAdapter
NewsAdapter
EventsAdapter
PortfolioAdapter
BrokerConstraintAdapter
```

The first paid production blocker will likely be data licensing, not code.

## AI Strategy

### LLM Use

LLMs should be used for:

- reasoning over evidence;
- writing clear explanations;
- attacking assumptions;
- comparing bull/bear cases;
- asking for missing checks;
- summarizing change since last run.

LLMs should not be used as the source of:

- prices;
- returns;
- volatility;
- backtests;
- portfolio risk;
- compliance status;
- order placement.

### Model-Agnostic Design

Build a provider abstraction:

```text
LLMProvider
  -> generateClaimPacket()
  -> critiqueClaimPackets()
  -> synthesizeDossier()
```

Support:

- local deterministic personas;
- cloud LLM providers;
- local models;
- ensemble/red-team models for high-risk workflows.

### Evaluation Before LLM Launch

Before turning on LLM-generated council packets:

- build golden dossiers;
- build adversarial prompt-injection tests;
- test hallucinated citations;
- test numeric fabrication;
- test overconfident conclusions;
- test hidden recommendation behavior;
- test failure to preserve dissent;
- require schema validation;
- require evidence refs.

## Compliance And Legal Plan

Legal counsel is mandatory before public launch.

### Initial Safer Posture

Launch as:

```text
research workflow / thesis discipline / decision-support tool
```

Avoid:

```text
personalized investment recommendations
automated advice
autonomous execution
performance promises
copy-trading
signal subscriptions
```

### Legal Questions To Answer Before Beta

1. Does the product provide investment advice for compensation?
2. Is output personalized to user holdings or risk profile?
3. Does any output constitute a “recommendation”?
4. Are users retail, professional, or institutional?
5. Are communications fair, balanced, and not misleading?
6. Are claims about AI truthful?
7. Are data licenses compatible with product use?
8. Does paper trading imply performance claims?
9. Is any broker connection contemplated?
10. Is registration, exemption, or partnership required?

### Practical Product Controls

- Use action classes, not buy/sell instructions.
- Keep `no_trade` and `research_needed` first-class.
- Require user-supplied thesis.
- Show uncertainty and invalidators prominently.
- Keep audit logs.
- Avoid model-generated performance claims.
- No automatic order placement.
- No hidden personalization without disclosure.

## Security Plan

### Threats

Parallax must defend against:

- prompt injection from news, filings, social text, webpages;
- malicious data payloads;
- account takeover;
- API key leakage;
- SSRF through data connectors;
- cross-tenant data leakage;
- over-privileged tools;
- unsafe file parsing;
- malicious plugin/skill supply chain;
- model output overreliance;
- audit log tampering.

### Security Controls

- tenant isolation;
- RBAC;
- encrypted secrets;
- least-privilege service tokens;
- sandboxed workers;
- egress allowlists;
- input validation;
- schema validation;
- immutable audit log;
- dependency scanning;
- SAST/DAST;
- prompt-injection test suite;
- rate limits;
- incident response plan;
- security event logging.

### Agent-Specific Controls

- external text is data, not instruction;
- council personas cannot execute tools directly;
- tool calls must be typed and allowlisted;
- no shell/network/file access from model outputs;
- all numeric claims require tool refs;
- all final outputs require decision gate;
- all order candidates require approval.

## Reliability And Observability

### Observability

Track:

- dossier creation latency;
- evidence fetch failures;
- stale data rate;
- veto rate;
- hallucination/unsupported-claim rate;
- audit replay success;
- trigger firing rate;
- alert precision;
- paper outcome attribution;
- model/tool version drift;
- user overrides;
- incident events.

### SLOs For SaaS Beta

Initial targets:

- 99.5% API availability;
- 95% dossier generation under 30 seconds for standard equity thesis;
- 100% audit bundle creation for completed dossiers;
- 0 known cross-tenant leaks;
- 0 live execution paths in beta.

## Testing Plan

The current test suite is a good start. Productization requires these additional layers:

1. Unit tests
   - schemas;
   - analytics;
   - decision gates;
   - lifecycle state machine.

2. Synthetic E2E tests
   - already started;
   - expand to more regimes and asset classes.

3. Historical replay tests
   - run dossiers across historical windows;
   - check trigger behavior and stale-state transitions.

4. Data vendor tests
   - missing data;
   - stale data;
   - corporate action errors;
   - symbol mapping conflicts;
   - vendor disagreement.

5. AI evals
   - hallucination;
   - unsupported numeric claims;
   - prompt injection;
   - hidden recommendation pressure;
   - failure to preserve dissent.

6. Security tests
   - SSRF;
   - tenant isolation;
   - injection;
   - secrets exposure;
   - unsafe file ingestion.

7. Compliance tests
   - marketing claims;
   - audit export;
   - restricted list;
   - action ceiling;
   - approval bypass.

## Product Roadmap

### Phase 0: Product-Legal Definition

Goal:

Define exactly what Parallax is allowed to be.

Deliverables:

- product positioning memo;
- legal posture memo;
- user class definition;
- risk disclosures;
- prohibited claims list;
- action ceiling policy;
- data license requirements;
- beta terms draft.

Exit criteria:

- clear public wording;
- no buy/sell signal positioning;
- counsel-reviewed launch boundaries.

### Phase 1: Local Alpha

Goal:

Turn the CLI prototype into a polished local workflow.

Deliverables:

- improved CLI;
- local app UI or Tauri/Electron shell;
- dossier library;
- watchlist view;
- local persistence;
- import/export;
- expanded synthetic E2E;
- user feedback loop.

Exit criteria:

- 20-50 trusted users can run Parallax locally;
- no cloud data risk;
- clear qualitative feedback on dossier usefulness.

### Phase 2: Data-Backed Research App

Goal:

Connect real licensed data and make dossiers useful on real markets.

Deliverables:

- market data adapter;
- fundamentals adapter;
- event calendar;
- news/provenance adapter;
- portfolio CSV/broker export import;
- corporate action handling;
- data freshness dashboard;
- source viewer.

Exit criteria:

- real US equities/ETF dossiers;
- deterministic replay;
- data licensing confirmed;
- stale and conflicting data handled visibly.

### Phase 3: LLM Council Beta

Status: Complete for local scripted-provider scope.

Goal:

Replace deterministic persona text with validated LLM claim packets. The current implementation proves the contract with `scripted_llm_council_v0`; external model adapters can now plug into the same validation boundary.

Deliverables:

- LLM provider abstraction;
- prompt registry;
- persona registry;
- claim packet schema enforcement;
- evidence-only context windows;
- adversarial evals;
- hallucination tests;
- red-team suite;
- cost controls.
- CLI `llm-eval` and `prompt-registry` commands.

Exit criteria:

- LLM council improves dossier quality without increasing unsupported claims;
- all outputs remain auditable;
- model failures downgrade action class.

### Phase 4: Lifecycle And Alerts

Status: Complete for local workspace scope.

Goal:

Make theses live over time.

Deliverables:

- lifecycle dashboard;
- trigger editor;
- alert preferences;
- market/event monitor;
- change-since-last-run view;
- stale/invalidated/upgraded states;
- notification system.
- replay-safe custom trigger overlays;
- alert preferences and muted symbols;
- local notification inbox;
- change-since-last-run state.

Exit criteria:

- users trust Parallax to tell them when a thesis needs recheck;
- alerts are precise enough to avoid fatigue.

### Phase 5: Paper Trading Lab

Status: Complete for local simulation scope.

Goal:

Connect thesis quality to simulated outcomes.

Deliverables:

- paper portfolio;
- simulated tickets;
- fill assumptions;
- slippage model;
- attribution;
- calibration dashboard;
- thesis/outcome review.
- persistent paper ledger;
- risk budget reservation;
- open/closed paper views;
- explicit simulation-only boundary.

Exit criteria:

- users can learn whether thesis process is improving;
- paper results do not become marketing performance claims.

### Phase 6: Team And Governance

Status: Complete for local team workspace scope.

Goal:

Make Parallax viable for teams and professionals.

Deliverables:

- workspaces;
- roles;
- review assignments;
- comments;
- approvals;
- audit exports;
- model/tool registry;
- release controls;
- SOC 2 readiness program.
- local `team-governance.json` ledger;
- role-bound approval enforcement;
- release readiness report;
- dashboard governance section;
- portable governance workspace export/import;
- governance package export;
- CLI `team-init`, `team-member-add`, `team-assign`, `team-comment`, `team-approve`, `team-report`, and `team-export` commands.

Exit criteria:

- small teams can use Parallax with review and audit discipline;
- governance controls are operational, not decorative.

### Phase 7: Regulated/Partner Execution

Status: Complete for partner sandbox handoff and locked production-adapter scope.

Goal:

Only if justified, add permissioned execution through a regulated partner.

Deliverables:

- legal/compliance approval;
- broker sandbox;
- broker production adapter;
- pre-trade controls;
- human approval;
- kill switch;
- post-trade review;
- market access control review.
- persistent partner-execution ledger;
- regulated partner registry;
- legal/compliance approval CLI;
- market-access review CLI;
- partner ticket, approval, controls, submission, report, kill-switch, and post-trade-review CLI;
- production adapter locked by default;
- regulatory source anchors for SEC/FINRA broker-dealer registration, market-access controls, supervision, and books/records.

Exit criteria:

- no order can bypass controls;
- partner/regulatory obligations are understood;
- live execution is limited, auditable, and reversible.

### Phase 8: Product Beta And Deployment

Status: Complete for local beta deployment scope.

Goal:

Make Parallax deployable for a controlled beta without weakening product boundaries.

Deliverables:

- authenticated TypeScript beta API;
- local beta readiness checks;
- deployment config with hashed API token;
- beta status endpoint;
- analysis API endpoint;
- dashboard endpoint;
- workspace/library/governance/partner API endpoints;
- Docker deployment scaffold;
- beta environment example;
- beta export package;
- external-provider status surface for SSO, market data, LLM, and regulated partner integrations.

Exit criteria:

- beta server can run from the repo;
- API calls require auth except health/readiness;
- raw beta token is not stored in config;
- external providers are explicit and disabled until configured;
- production partner adapter remains locked by default;
- beta export package can reconstruct readiness and workspace state.

### Phase 9: Managed SaaS And External Integrations

Status: Complete for managed beta scaffold scope.

Goal:

Create the control-plane evidence needed before Parallax can become a hosted product for other people.

Deliverables:

- managed SaaS config;
- tenant workspace registry;
- tenant audit-directory isolation;
- external secret-reference registry;
- external integration manifest registry;
- identity-provider manifest placeholder;
- market-data vendor manifest placeholder;
- LLM provider manifest placeholder;
- regulated-partner manifest placeholder;
- observability manifest and JSONL event log;
- managed SaaS readiness/status reports;
- managed SaaS export package;
- CLI workflow and tests.

Exit criteria:

- tenant slugs cannot escape the managed root;
- each tenant gets an isolated audit directory;
- raw secrets are not stored;
- provider manifests exist but remain disabled until configured;
- readiness reports external integration gaps explicitly;
- production execution remains locked;
- export package reconstructs managed readiness evidence.

### Phase 10: Provider Validation And Hosted Console

Status: Complete for provider-contract beta scope.

Goal:

Turn external-provider manifests into explicit local contract checks and give operators a hosted-product console foundation before any real vendor is connected.

Deliverables:

- provider contract validator;
- sanitized provider validation report;
- SSO endpoint contract checks;
- market-data license contract checks;
- LLM provider production-lock checks;
- regulated-partner legal/production-lock checks;
- observability event checks;
- blocked-manifest test case;
- hosted console HTML generator;
- CLI workflow and tests.

Exit criteria:

- provider validation cannot expose raw secret references;
- missing licenses or invalid contracts block readiness;
- production providers remain locked by manifest;
- hosted console renders tenants, providers, controls, and production boundaries;
- external vendors remain manifests until credentials, licenses, legal review, and production validation are complete.

### Phase 11: Hosted Multi-Tenant API And Persistence

Status: Complete for local hosted API scope.

Goal:

Turn the managed SaaS scaffold into a local hosted API that can serve multiple tenants without leaking state, while preserving the no-live-execution boundary.

Deliverables:

- tenant state and event persistence files;
- tenant path and state-key validation;
- hosted API readiness report;
- authenticated HTTP server;
- tenant-scoped state, event, library, analysis, status, control-plane, health, readiness, and console routes;
- cross-tenant header enforcement;
- secret-like tenant payload rejection;
- CLI workflow and tests.

Exit criteria:

- tenant state and libraries stay isolated by tenant root;
- hosted API requires bearer auth for product routes;
- tenant routes require a matching `x-parallax-tenant` header;
- hosted readiness requires provider contracts, tenant persistence, auth config, tenant count, and production-provider lock;
- hosted API does not store raw bearer tokens or connect live brokers;
- secret-like tenant payloads are rejected before persistence.

## Team Needed

Minimum productization team:

- product/CEO;
- TypeScript full-stack engineer;
- Python quant/data engineer;
- AI/LLM engineer;
- security engineer or advisor;
- compliance/legal counsel;
- design/product UX;
- part-time finance/domain expert;
- data vendor/commercial owner.

## Business Model

Start with subscriptions.

Possible tiers:

1. **Local Pro**
   - local app;
   - manual data/imports;
   - personal dossier library.

2. **Cloud Pro**
   - hosted data;
   - saved dossiers;
   - lifecycle alerts;
   - paper lab.

3. **Team**
   - workspaces;
   - comments;
   - review workflows;
   - audit exports.

4. **Governance/Enterprise**
   - compliance package;
   - SSO;
   - model registry;
   - data controls;
   - custom integrations.

Avoid performance-fee or signal-subscription models at the start. They create the wrong incentives and more regulatory risk.

## GTM Plan

### First Audience

Start with people who already write trade theses:

- independent analysts;
- active discretionary traders;
- small funds;
- finance creators who teach process;
- research teams.

### Launch Message

Use:

> Better trade theses. Clearer invalidators. Less hidden conviction.

Avoid:

> AI that tells you what to buy.

### First Proof Points

- before/after thesis quality;
- reduced stale-thesis mistakes;
- better documentation;
- better post-mortems;
- clearer risk language;
- fewer impulsive entries.

## Most Important Product Decisions

### Decision 1: Research Tool First

Do not start as an investment adviser or trading signal service.

### Decision 2: Dossier Is The Product

The core object is not a chat answer. It is a saved, replayable, monitored dossier.

### Decision 3: Lifecycle Is The Moat

The valuable thing is not a one-time opinion. It is knowing when a thesis has become stale, invalidated, or worth rechecking.

### Decision 4: Deterministic Tools Own Numbers

Never let generated text be the source of financial calculations.

### Decision 5: Compliance And Audit Are Core UX

Safety should not be hidden in backend logs. It should be visible in the product.

## Kill Criteria

Stop or redesign if:

- users treat it as a buy/sell oracle despite UX controls;
- unsupported claims persist after evals;
- data licensing cannot support commercial use;
- alerts are too noisy to trust;
- paper outcomes create misleading marketing pressure;
- compliance posture cannot be made clear;
- unit economics are broken by data/model costs.

## Immediate Next Steps

1. Build product/legal positioning memo.
2. Decide first user class and prohibited use cases.
3. Convert CLI flow into a desktop/web dossier UI.
4. Add real licensed US equities/ETF data adapter.
5. Add source viewer and evidence inspector.
6. Build LLM provider abstraction behind eval gates.
7. Expand E2E suite with real historical replay.
8. Create private alpha with 10-20 serious users.
9. Collect dossier usefulness feedback.
10. Decide whether to remain local-first or move to SaaS beta.

## Final Reviewed Plan

The best solution is not to make Parallax more autonomous.

The best solution is to make it more trustworthy:

- clearer product positioning;
- stronger evidence layer;
- better UI;
- real data;
- validated LLM council;
- lifecycle monitoring;
- auditability;
- governance;
- paper attribution;
- regulated execution only later.

This plan preserves the original insight of Parallax while turning it into something other people could actually use.
