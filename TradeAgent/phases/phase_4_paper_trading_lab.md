# Phase 4: Paper Trading Lab

## Goal

Test selected theses in simulation without live market risk. Paper trades should teach whether the dossier process has edge, discipline, and useful timing.

## Deliverables

- Paper-trade candidate gate.
- Simulated order ticket.
- Fill model.
- Risk budget reservation.
- Paper portfolio.
- Outcome attribution.
- Paper performance dashboard.

## Implementation Steps

1. Lift action ceiling to `paper_trade_candidate` for validated scenarios.

2. Add paper-trade gate.
   - Requires active thesis, freshness above threshold, no hard vetoes, and explicit sizing envelope.

3. Create simulated order ticket.
   - Symbol, side, size, order type, limit assumptions, stop/invalidation, target/review triggers.

4. Implement fill model.
   - Record whether using close price, next bar, VWAP proxy, spread/slippage model, or event-specific assumption.

5. Implement paper portfolio.
   - Track positions, exposure, PnL, drawdown, turnover, and concentration.

6. Implement attribution.
   - Thesis quality.
   - Entry timing.
   - Sizing.
   - Execution assumption.
   - Risk control.
   - Market regime.

7. Feed results into calibration reports.
   - Do not auto-rewrite prompts or strategies.

## Test Plan

- Paper ticket cannot be created from stale thesis.
- Paper ticket cannot exceed risk budget.
- Fill assumption is recorded.
- PnL attribution is generated after close.
- Paper result is linked to original dossier and audit bundle.
- Paper performance does not unlock live execution automatically.

## Exit Criteria

- Paper trades are auditable from thesis to outcome.
- Risk budget reservation prevents overcommitment.
- Attribution distinguishes good process from lucky outcome.

## Risks

- Paper fills are too optimistic.
- Users confuse paper performance with live readiness.
- Attribution becomes PnL-only and loses process value.
