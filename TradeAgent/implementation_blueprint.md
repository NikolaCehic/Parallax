# Implementation Blueprint

## Target Prototype

Build the first version as an analysis-only harness. It should produce Trade Thesis Dossiers and never place live orders.

## Suggested Repository Shape

```text
tradeagent/
  apps/
    analyst_console/
  packages/
    evidence_store/
    analytics/
    council/
    decision_gate/
    audit_log/
    integrations/
  configs/
    council_config.yaml
    risk_limits.yaml
    data_sources.yaml
  tests/
    fixtures/
    replay/
    validation/
```

## Runtime Flow

1. User submits a question or candidate thesis.
2. Intake normalizes asset, horizon, mandate, portfolio context, and allowed action class.
3. Evidence store freezes a data snapshot.
4. Analytics layer runs required deterministic checks.
5. Council runs independent first-pass persona packets.
6. Cross-examination round attacks assumptions and missing evidence.
7. Synthesizer creates the Trade Thesis Dossier.
8. Decision gate applies vetoes and downgrades.
9. Lifecycle engine assigns state, expiry, triggers, and dependency graph.
10. Audit bundle is persisted.
11. Output is returned as memo plus machine-readable decision packet.
12. Market-state sentinel monitors triggers and schedules revalidation.

## Minimum Interfaces

### EvidenceItem

```json
{
  "id": "ev_001",
  "kind": "price | filing | news | macro | portfolio | broker_constraint | user_mandate",
  "source": "vendor_or_url",
  "as_of": "2026-04-30T00:00:00Z",
  "retrieved_at": "2026-04-30T00:00:00Z",
  "license": "internal | public | restricted",
  "freshness_status": "fresh | stale | unknown",
  "payload_ref": "object_store_or_db_ref"
}
```

### ToolOutput

```json
{
  "id": "tool_001",
  "tool_name": "volatility_check",
  "tool_version": "0.1.0",
  "inputs": ["ev_001"],
  "created_at": "2026-04-30T00:00:00Z",
  "result_ref": "object_store_or_db_ref",
  "status": "passed | failed | warning"
}
```

### DecisionPacket

```json
{
  "id": "dp_001",
  "action_class": "no_trade | research_needed | watchlist | paper_trade_candidate | order_ticket_candidate",
  "thesis_state": "draft | active | stale | invalidated | upgraded | closed | archived",
  "confidence": 0.0,
  "freshness_score": 0.0,
  "confidence_cap_reason": "risk_veto | data_gap | unresolved_dissent | none",
  "vetoes": [],
  "dissent": [],
  "invalidators": [],
  "next_review_trigger": "",
  "audit_bundle_ref": "object_store_or_db_ref"
}
```

### ThesisTrigger

```json
{
  "id": "trig_001",
  "kind": "observe | recheck | downgrade | invalidate | escalate",
  "condition_type": "price | volatility | liquidity | news | event | portfolio | regime | correlation | time",
  "condition": "machine_checkable_expression",
  "human_rationale": "Why this condition matters to the thesis",
  "linked_assumption": "assumption_id",
  "last_checked_at": "2026-04-30T00:00:00Z"
}
```

### ThesisLifecycle

```json
{
  "dossier_id": "dos_001",
  "state": "active",
  "valid_as_of": "2026-04-30T00:00:00Z",
  "expires_at": "2026-04-30T16:00:00Z",
  "freshness_score": 0.91,
  "dependency_refs": ["NVDA", "SMH", "QQQ", "US10Y"],
  "triggers": ["trig_001"],
  "last_revalidated_at": "2026-04-30T00:00:00Z"
}
```

## Test Strategy

1. Schema tests
   - Persona packets and decision packets must validate.

2. Deterministic replay tests
   - Same frozen evidence and same versions produce the same dossier.

3. Data failure tests
   - Stale, missing, or conflicting data triggers downgrade or veto.

4. Prompt-injection tests
   - External text cannot cause tool misuse or policy bypass.

5. Backtest integrity tests
   - No lookahead, survivorship, or cost omission in supported strategies.

6. Approval bypass tests
   - No API path can place or stage live orders without required approvals.

7. Audit reconstruction tests
   - A reviewer can reconstruct every final claim from evidence, tools, and persona packets.

8. Lifecycle tests
   - Expired, stale, or invalidated theses cannot be escalated.

9. Trigger replay tests
   - Historical price/news/event streams produce the expected recheck, downgrade, and invalidation actions.

## First Four Milestones

1. Static dossier generator
   - Use local fixture data and mocked tool outputs.

2. Real evidence ingestion
   - Add one market data vendor and one news/source adapter.

3. Deterministic analytics
   - Add volatility, drawdown, liquidity, cost, and simple backtest modules.

4. Thesis lifecycle engine
   - Add state, expiry, freshness scoring, and static trigger evaluation.

5. Paper-trade simulator
   - Add simulated order tickets, fill assumptions, and outcome attribution.

## Do Not Build First

- autonomous live trading;
- complex portfolio optimizer;
- dozens of personas;
- self-modifying prompts;
- alternative data ingestion without license tracking;
- high-frequency execution logic.

Those are later-stage complexity. The prototype should first prove the dossier, debate, gate, and audit loop.
