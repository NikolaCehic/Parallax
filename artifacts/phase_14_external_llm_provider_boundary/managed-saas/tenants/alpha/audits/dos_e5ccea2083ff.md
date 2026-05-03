# NVDA swing thesis dossier

Generated: 2026-05-03T10:00:00Z

## Decision

- Action class: watchlist
- Thesis state: active
- Confidence: 0.46
- Freshness: 1
- Next trigger: Momentum turns negative.

## Thesis

hosted phase fourteen external model replay thesis

## Product Boundary

- Status: allowed
- Effective action ceiling: watchlist
- Legal posture: Research support only. Parallax is not a broker, investment adviser, signal service, tax adviser, legal adviser, or live execution system.

## Council Summary

3 support, 0 oppose, 1 need more data.

## Council Evaluation

- Provider: model-gateway-replay
- Passed: true
- Problems: 0
- Warnings: 0
- Contexts: 4
- Estimated model cost: 0.004324

## Strongest Bull Case

The 20-period momentum is positive, but the edge remains conditional on costs, volatility, and confirmation.

## Strongest Bear Case

The strongest countercase is that this thesis is chasing already-visible price action without enough validated edge.

## Dissent

None recorded.

## Vetoes

None.

## Invalidators

- Momentum turns negative.
- Volatility expands beyond threshold.
- Any central data item becomes stale, missing, restricted, or conflicting.
- Unregistered model or prompt configuration is used.
- Replay fails.
- Confirmation fails.
- Event risk changes premise.
- Portfolio exposure worsens.

## Lifecycle Triggers

- invalidate/price: `last_price < 111.73` - Price moved below the thesis invalidation band.
- recheck/price: `last_price > 117.47` - Price moved enough to require a new risk/reward check.
- downgrade/volatility: `annualized_volatility_20 > 0.850` - Volatility expanded beyond the allowed thesis envelope.
- downgrade/time: `now > 2026-05-04T10:00:00.000Z` - Evidence snapshot expired for this horizon.

## Audit

- Dossier ID: dos_e5ccea2083ff
- Evidence snapshot: snap_f14d5b640f32
- Tool outputs: 11
- Claim packets: 4
