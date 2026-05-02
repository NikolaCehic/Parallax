# Parallax E2E Testing

The E2E suite is designed to challenge the full Parallax pipeline with synthetic but varied market, fundamentals, news, corporate actions, portfolio, event, lifecycle, paper-trading, governance, local-alpha workspace, and sandbox-execution data.

It does not use one static happy-path fixture. Each E2E scenario creates its own temporary market data, event data, and portfolio constraints, then runs:

```text
Evidence Snapshot
  -> Python Analytics Worker
  -> TypeScript Council
  -> Cross-Examination
  -> Decision Gate
  -> Lifecycle Assignment
  -> Audit/Governance/Workspace/Paper/Sandbox paths where relevant
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

## Issues Found By E2E

The first E2E run exposed real weaknesses:

- past events were counted as future event risk by the Python analytics worker;
- boolean lifecycle trigger expressions such as `material_event_arrives == true` were compared as strings.

Both were fixed before this suite was accepted.

## Exit Condition

The current E2E suite supports the project exit condition:

> I do not know how to improve the system any more and I do not know what is wrong with the current solution.

Within the current local prototype scope, the suite now checks the most important structural risks: stale data, bad compliance state, restricted data licenses, concentration risk, high volatility, event timing, corporate-action adjustment, weak source provenance, lifecycle decay, paper trading discipline, audit replay, governance validation, local workspace portability, dashboard generation, approval bypass, kill switch, and pre-trade controls.

The remaining improvements are productionization choices, not known architectural defects:

- external data vendor APIs and commercial licenses;
- richer Python quant analytics;
- real model adapters;
- cloud deployment;
- regulated live execution review.
