# Phase 2: Evidence And Analytics

## Goal

Replace mocked facts with real evidence ingestion and deterministic analytics for a narrow initial market scope.

Recommended initial scope: US equities, daily/hourly data, watchlist-only action ceiling.

## Deliverables

- Market data adapter.
- News/event adapter or local event calendar.
- Portfolio profile fixture/import.
- Data-quality checks.
- Deterministic analytics service.
- Tool output registry.
- Numeric-claim enforcement.

## MVP Analytics

- Return series.
- Realized volatility.
- Drawdown.
- Beta/correlation to benchmark.
- Relative volume/liquidity proxy.
- Spread proxy if available.
- Basic transaction-cost estimate.
- Portfolio exposure check.
- Event calendar check.

## Implementation Steps

1. Select data source.
   - Start with one provider and preserve vendor caveats.

2. Implement evidence ingestion.
   - Normalize symbols, timestamps, and source metadata.

3. Implement data-quality checks.
   - Stale data.
   - Missing fields.
   - Symbol mismatch.
   - Vendor disagreement if multiple sources exist.

4. Implement analytics tools.
   - Each tool output must have version, inputs, status, and result hash.

5. Wire tools into council.
   - Personas receive tool outputs, not raw calculation permission by default.

6. Enforce numeric-claim policy.
   - Numeric claims without evidence/tool refs fail validation or are marked unverified.

7. Expand fixtures.
   - Add historical snapshots for replay tests.

## Test Plan

- Stale data triggers veto or downgrade.
- Missing price series fails gracefully.
- Analytics outputs are deterministic for the same snapshot.
- Tool version appears in audit bundle.
- Persona numeric claims cite tool output IDs.
- Watchlist action ceiling remains enforced.

## Exit Criteria

- Real evidence snapshots can be created.
- Deterministic analytics replace mocks for core metrics.
- Data-quality vetoes work.
- Dossiers remain replayable from frozen snapshots.

## Risks

- Vendor data terms or freshness limitations.
- Symbol normalization errors.
- Overfitting analytics before lifecycle monitoring is ready.
