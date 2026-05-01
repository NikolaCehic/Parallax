# Phase 6: Permissioned Execution

## Goal

Add live execution only as a tightly controlled, human-approved order-ticket workflow.

This phase must not turn Parallax into an autonomous trading bot. It prepares candidate tickets and enforces controls before any live order can exist.

## Prerequisites

- Phase 4 paper-trading evidence is strong enough to justify further work.
- Phase 5 governance controls are active.
- Legal/compliance review is complete for the intended use case.
- Broker sandbox integration has passed tests.

## Deliverables

- Broker sandbox adapter.
- Order-ticket candidate schema.
- Human approval workflow.
- Pre-trade risk controls.
- Broker/account constraint checks.
- Kill switch.
- Post-trade review workflow.
- Approval bypass tests.

## Implementation Steps

1. Add broker sandbox adapter.
   - Start with paper/sandbox mode only.

2. Add order-ticket candidate.
   - It is a proposal, not an order.

3. Add approval workflow.
   - Require explicit human approval with dossier attached.

4. Add pre-trade controls.
   - Mandate.
   - Risk budget.
   - Position concentration.
   - Liquidity/slippage.
   - Margin/leverage.
   - Restricted list.
   - Freshness/state.

5. Add server-side enforcement.
   - Approval cannot be bypassed by UI or API.

6. Add kill switch.
   - Disable ticket creation and broker submission.

7. Add post-trade review.
   - Compare thesis, expected risk, fill, outcome, and control behavior.

8. Add live-readiness review.
   - Decide whether live mode remains disabled, sandbox-only, or limited pilot.

## Test Plan

- No stale thesis can create an order ticket.
- No invalidated thesis can create an order ticket.
- No ticket can submit without approval.
- Approval expires when thesis becomes stale.
- Kill switch blocks all submission paths.
- Pre-trade controls reject breaches.
- Post-trade review is required after execution.

## Exit Criteria

- Broker integration cannot bypass Parallax gates.
- Human approval and pre-trade checks are enforced server-side.
- Kill switch is tested.
- Every ticket links back to a dossier and audit bundle.

## Risks

- Execution creates regulatory and operational obligations.
- Users may overtrust prior paper results.
- Broker/API edge cases can bypass intended workflows if not tested aggressively.
