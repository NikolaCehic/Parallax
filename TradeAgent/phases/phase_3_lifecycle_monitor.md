# Phase 3: Lifecycle Monitor

## Goal

Make dossiers live responsibly over time. A thesis should become stale, invalidated, upgraded, or rechecked as the market changes.

## Deliverables

- Thesis state machine.
- Dynamic expiry policy.
- Freshness scoring service.
- Trigger evaluator.
- Dependency graph.
- Revalidation scheduler.
- Historical trigger replay tests.

## State Machine

Allowed states:

- `draft`
- `active`
- `stale`
- `invalidated`
- `upgraded`
- `closed`
- `archived`

Valid transitions:

```text
draft -> active
draft -> invalidated
active -> stale
active -> invalidated
active -> upgraded
active -> closed
stale -> active
stale -> invalidated
upgraded -> active
closed -> archived
invalidated -> archived
```

## Trigger Types

- Price trigger.
- Volatility trigger.
- Liquidity/spread trigger.
- News trigger.
- Scheduled event trigger.
- Portfolio exposure trigger.
- Regime trigger.
- Correlation/dependency trigger.
- Time expiry trigger.

## Trigger Severities

- `observe`: log only.
- `recheck`: rerun affected tools/personas.
- `downgrade`: lower action class pending review.
- `invalidate`: block action.
- `escalate`: notify human/reviewer.

## Implementation Steps

1. Implement lifecycle state store.

2. Implement dynamic expiry.
   - Based on horizon, asset class, volatility, event risk, and action class.

3. Implement freshness score.
   - Combine evidence age and market drift.

4. Implement trigger evaluator.
   - Conditions must be machine-checkable.

5. Implement dependency graph.
   - Link primary symbol to benchmark, sector ETF, factor proxy, macro references, portfolio holdings, and events.

6. Implement partial revalidation.
   - Minor changes rerun affected axes only.
   - Hard triggers force decision-gate review.

7. Add trigger replay tests.
   - Use historical fixture streams.

## Test Plan

- Expired thesis becomes stale.
- Price invalidator marks thesis invalidated.
- Confirmation trigger marks watchlist thesis upgraded.
- Regime trigger schedules broader review.
- Stale and invalidated theses cannot be escalated.
- Trigger replay is deterministic.

## Exit Criteria

- Lifecycle is operational, not just stored metadata.
- Market changes can alter thesis state.
- Revalidation is scheduled or executed according to trigger severity.
- Audit bundle records lifecycle transitions.

## Risks

- Alert fatigue from too many triggers.
- Trigger expressions too vague to automate.
- Over-refreshing dossiers and wasting model/tool budget.
