# Parallax E2E Testing

The E2E suite is designed to challenge the full Parallax pipeline with synthetic but varied market, fundamentals, news, corporate actions, portfolio, event, lifecycle, alerting, paper-trading ledger, team governance, local-alpha workspace, LLM council, and sandbox-execution data.

It does not use one static happy-path fixture. Each E2E scenario creates its own temporary market data, event data, and portfolio constraints, then runs:

```text
Evidence Snapshot
  -> Python Analytics Worker
  -> TypeScript Council or LLM Council Harness
  -> Cross-Examination
  -> Decision Gate
  -> Lifecycle Assignment
  -> Audit/Governance/Workspace/Alerts/Paper Lab/Team Governance/Sandbox paths where relevant
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

## Issues Found By E2E

The first E2E run exposed real weaknesses:

- past events were counted as future event risk by the Python analytics worker;
- boolean lifecycle trigger expressions such as `material_event_arrives == true` were compared as strings.

Both were fixed before this suite was accepted.

## Exit Condition

The current E2E suite supports the project exit condition:

> I do not know how to improve the system any more and I do not know what is wrong with the current solution.

Within the current local prototype scope, the suite now checks the most important structural risks: stale data, bad compliance state, restricted data licenses, concentration risk, high volatility, event timing, corporate-action adjustment, weak source provenance, LLM hallucination, prompt injection, unsupported LLM numerical claims, LLM budget overrun, lifecycle decay, custom trigger safety, alert preference muting, notification generation, change-since-last-run tracking, paper risk overcommitment, paper outcome attribution, simulation-only boundaries, audit replay, governance validation, role approval bypass, release-readiness gaps, SOC 2 readiness evidence, local workspace portability, dashboard generation, approval bypass, kill switch, and pre-trade controls.

The remaining improvements are productionization choices, not known architectural defects:

- external data vendor APIs and commercial licenses;
- richer Python quant analytics;
- external model adapters;
- cloud deployment;
- regulated live execution review.
