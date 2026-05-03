# Parallax E2E Testing

The E2E suite is designed to challenge the full Parallax pipeline with synthetic but varied market, fundamentals, news, corporate actions, portfolio, event, lifecycle, alerting, paper-trading ledger, team governance, partner-execution controls, beta-deployment API state, managed SaaS control-plane state, provider validation state, hosted API state, hosted console state, guided repair state, identity/session state, durable storage state, data-vendor state, LLM-provider state, local-alpha workspace, LLM council, and sandbox-execution data.

It does not use one static happy-path fixture. Each E2E scenario creates its own temporary market data, event data, and portfolio constraints, then runs:

```text
Evidence Snapshot
  -> Python Analytics Worker
  -> TypeScript Council or LLM Council Harness
  -> Cross-Examination
  -> Decision Gate
  -> Lifecycle Assignment
  -> Audit/Governance/Workspace/Alerts/Paper Lab/Team Governance/Partner Execution/Beta API/Managed SaaS/Provider Validation/Hosted API/Hosted Console/Guided Repair/Identity/Storage/Data Vendor/LLM Provider/Sandbox paths where relevant
```

Run:

```bash
npm test
```

## Current Coverage

The E2E suite currently proves:

1. clean liquid momentum can reach `paper_trade_candidate`;
2. stale market data hard-vetoes escalation;
3. restricted symbols hard-veto through compliance;
4. concentration breaches hard-veto through portfolio risk;
5. violent volatility creates dissent and blocks paper promotion;
6. future material events shorten expiry and add escalation triggers;
7. past material events do not create future event risk;
8. lifecycle triggers invalidate, recheck, and expire theses correctly;
9. paper trading records ticket, fill, close, attribution, and calibration;
10. sandbox execution cannot bypass approval, approval expiry, kill switch, or risk controls;
11. Phase 1 local-alpha workspace can analyze, block unsafe framing, collect feedback, export, import, and generate a dashboard;
12. Phase 2 data-backed research can ingest local licensed data packs, apply corporate actions, score fundamentals/news provenance, import portfolio CSVs, surface source metadata, and block stale or restricted data.
13. Phase 3 LLM council beta can run evidence-only persona contexts, replay an LLM-backed dossier, expose prompt/provider registry state, and reject hallucinated refs, unsupported calculations, hidden recommendations, prompt-injection obedience, and cost overruns.
14. Phase 4 lifecycle alerts can add replay-safe custom triggers, persist change-since-last-run checks, enforce muted alert preferences, generate local notifications, export/import lifecycle state, and render notification dashboard sections.
15. Phase 5 paper trading lab can reserve risk budget, persist open and closed simulated trades, attribute outcomes, record review notes, export/import the paper ledger, and prove paper performance stays simulation-only.
16. Phase 6 team governance can initialize a workspace, enforce role-aware review approvals, block release readiness until required approvals are complete, export governance evidence, preserve paths across import, and render governance dashboard sections.
17. Phase 7 partner execution can require team-release readiness, legal/compliance approval, market-access review, human approval, kill-switch clearance, pre-trade controls, production-adapter unlock, sandbox handoff, post-trade review, export/import portability, and dashboard visibility.
18. Phase 8 beta deployment can initialize hashed-token config, report local-beta readiness, reject unauthenticated API calls, create dossiers through the API, serve status/library/dashboard endpoints, and export a beta deployment package.
19. Phase 9 managed SaaS can initialize a control plane, isolate tenant audit directories, reject path traversal, store only external secret references, declare disabled external provider manifests, record observability events, report readiness, and export managed evidence.
20. Phase 10 provider validation can check SSO, market-data, LLM, regulated-partner, and observability manifests, block invalid vendor contracts, hide raw secret references, and generate the hosted console HTML.
21. Phase 11 hosted API can report hosted readiness, persist tenant state/events, block cross-tenant access, reject secret-like tenant payloads, create tenant-scoped dossiers through HTTP, keep tenant libraries separated, serve the hosted console, and expose human-readable CLI controls.
22. Phase 12 identity/storage foundation can issue hash-only local identity sessions, enforce role/scoped tenant API access, reject cross-tenant session use, write durable tenant objects, create storage checkpoints, reject secret-like storage payloads, and report hosted foundation readiness.
23. Phase 13 external data vendor boundary can register licensed market-data adapters, import tenant-scoped vendor packs, preserve provenance hashes, block restricted licenses and unapproved symbols, serve hosted import/status routes, and deny unsafe analysis `data_dir` escape.
24. Phase 14 external LLM provider boundary can register replay-only model adapters, run provider-specific eval suites, produce evidence-only replay dossiers, enforce budget/secret/network gates, serve hosted replay analysis/status routes, and deny unsafe analysis `data_dir` escape.
25. Phase 15 hosted research console can render onboarding, readiness rails, boundary status, tenant analysis form, tenant library/events panes, serve through the authenticated hosted route, expose data/model boundary status in the control-plane overview, create a hosted dossier, and keep raw secrets/tokens out of HTML.
26. Phase 16 guided connector repair can preview blocked setup work, apply local control-plane/identity/storage/data/model repairs in order, converge to ready connector status, expose hosted repair routes, render console repair controls, and keep raw secrets/tokens out of outputs.

## Issues Found By E2E

The first E2E run exposed real weaknesses:

- past events were counted as future event risk by the Python analytics worker;
- boolean lifecycle trigger expressions such as `material_event_arrives == true` were compared as strings.

Both were fixed before this suite was accepted.

## Exit Condition

The current E2E suite supports the project exit condition:

> I do not know how to improve the system any more and I do not know what is wrong with the current solution.

Within the current local prototype scope, the suite now checks the most important structural risks: stale data, bad compliance state, restricted data licenses, concentration risk, high volatility, event timing, corporate-action adjustment, weak source provenance, LLM hallucination, prompt injection, unsupported LLM numerical claims, LLM budget overrun, lifecycle decay, custom trigger safety, alert preference muting, notification generation, change-since-last-run tracking, paper risk overcommitment, paper outcome attribution, simulation-only boundaries, audit replay, governance validation, role approval bypass, release-readiness gaps, SOC 2 readiness evidence, partner legal approval gaps, market-access breaches, partner human-approval gaps, production-adapter bypass, post-trade-review persistence, beta API authentication, beta readiness drift, raw-token persistence, tenant path traversal, raw-secret persistence, external-provider validation gaps, provider-contract blocking, hosted-console redaction, hosted-console authenticated serving, hosted-console analysis path, hosted API authentication, identity-session redaction, scoped tenant access, tenant-state isolation, cross-tenant denial, durable-storage path isolation, storage checkpoint absence, data-vendor license blocking, vendor symbol allow-list enforcement, unsafe vendor `data_dir` escape, external model eval failure, unsafe model `data_dir` escape, direct model-network disablement, secret-payload rejection, managed observability evidence, local workspace portability, dashboard generation, approval bypass, kill switch, and pre-trade controls.

The remaining improvements are productionization choices, not known architectural defects:

- live external data vendor APIs and commercial licenses;
- richer Python quant analytics;
- live external model adapters;
- real managed cloud deployment and SSO;
- production cloud database/object storage;
- real regulated partner production adapter.
