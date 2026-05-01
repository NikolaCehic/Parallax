# Parallax SPEC

Version: 0.1.0  
Status: Draft implementation specification  
Scope: analysis-first trading thesis council with lifecycle monitoring  

## 1. Product Definition

Parallax is a governed trading-analysis harness that turns market questions and trade ideas into auditable Trade Thesis Dossiers.

It is not a default live-trading bot. The first production-grade version must stop at analysis, watchlist, and paper-trade candidate workflows. Any live execution path is explicitly out of scope until later phases add broker controls, human approval, pre-trade gates, kill switch, and post-trade review.

## 2. Core Objective

For a given question, candidate trade, portfolio context, and time horizon, Parallax must answer:

> Is this thesis supported, unsupported, stale, invalidated, too risky, worth watching, or suitable for paper-trade testing under the current evidence snapshot?

The system must preserve the reasoning chain that produced the answer.

## 3. Non-Goals

- No autonomous live trading in the MVP.
- No unvalidated strategy self-improvement.
- No LLM-generated numerical claims without deterministic tool support.
- No hidden order staging or broker access bypass.
- No claim that the system provides legal, financial, tax, or investment advice.
- No high-frequency trading design in the initial system.

## 4. Primary Users

1. Individual analyst or trader
   - Wants better trade-thesis discipline and risk review.

2. Portfolio manager or investment team
   - Wants structured debate, audit trail, and watchlist monitoring.

3. Quant/research operator
   - Wants evidence-linked analysis, replayability, and validation hooks.

4. Compliance/model-risk reviewer
   - Wants reconstructable outputs, logs, approvals, and controls.

## 5. Core Concepts

### 5.1 Trade Thesis Dossier

The main user-facing artifact. It contains:

- user question;
- normalized instrument and horizon;
- evidence snapshot;
- deterministic tool outputs;
- council summary;
- strongest bull case;
- strongest bear case;
- assumptions;
- invalidators;
- confirmation triggers;
- risk and sizing envelope;
- execution notes;
- action class;
- thesis lifecycle state;
- freshness score;
- dissent;
- vetoes;
- audit references.

### 5.2 Evidence Snapshot

A frozen set of inputs used for a specific analysis. All subsequent reasoning must refer to this snapshot or explicitly request a newer one.

### 5.3 Persona Claim Packet

A structured contribution from one council persona. It must distinguish facts, calculations, assumptions, inferences, risks, invalidators, and proposed action.

### 5.4 Decision Packet

The machine-readable result from the decision gate. It records action class, confidence, freshness, vetoes, dissent, invalidators, and audit references.

### 5.5 Thesis Lifecycle

Every dossier is a stateful object. It can become stale, invalidated, upgraded, closed, or archived as the market changes.

## 6. Required System Layers

### 6.1 Intake Layer

Responsibilities:

- parse the user request;
- identify asset, horizon, strategy type, and requested action;
- resolve user mandate and account/portfolio constraints if available;
- set maximum allowed action class;
- reject or downgrade underspecified requests.

Must output:

- `NormalizedQuestion`
- intake warnings
- required evidence list

### 6.2 Evidence Layer

Responsibilities:

- ingest market, fundamental, macro, news, event, portfolio, and constraint data;
- normalize timestamps and symbols;
- attach provenance, freshness, and license metadata;
- freeze an evidence snapshot for each dossier.

Must output:

- `EvidenceItem[]`
- `EvidenceSnapshot`
- data-quality warnings

### 6.3 Deterministic Analytics Layer

Responsibilities:

- calculate market and portfolio metrics;
- run backtests, walk-forward tests, stress tests, and cost estimates when supported;
- produce versioned tool outputs;
- reject unsupported calculations rather than inventing values.

MVP analytics:

- returns;
- volatility;
- drawdown;
- beta/correlation;
- liquidity/spread proxy;
- simple transaction-cost estimate;
- portfolio exposure;
- basic event calendar check.

### 6.4 Council Layer

Responsibilities:

- run configured personas independently;
- require schema-valid claim packets;
- enforce tool permissions;
- prevent personas from mutating state directly;
- preserve dissent.

Minimum MVP personas:

- Quant Researcher;
- Fundamental Analyst;
- Technical and Microstructure Analyst;
- Portfolio Risk Manager;
- Compliance and Conflicts Officer;
- Red Team Skeptic.

Full target personas:

- Regime Cartographer;
- Quant Researcher;
- Fundamental Analyst;
- Technical and Microstructure Analyst;
- Macro and Cross-Asset Analyst;
- Sentiment and News Analyst;
- Data Quality Officer;
- Portfolio Risk Manager;
- Execution Specialist;
- Compliance and Conflicts Officer;
- Model Validator;
- Red Team Skeptic.

### 6.5 Debate And Synthesis Layer

Responsibilities:

- run independent first-pass analysis;
- run cross-examination;
- force red-team critique;
- generate a dossier without hiding dissent;
- cap confidence when critical disagreement remains unresolved.

### 6.6 Decision Gate

Responsibilities:

- apply hard vetoes;
- downgrade action classes;
- produce final decision packet;
- block stale or invalidated theses;
- guarantee that no live path is reachable without explicit phase support.

Action classes:

- `no_trade`
- `research_needed`
- `watchlist`
- `paper_trade_candidate`
- `order_ticket_candidate`

MVP action ceiling:

- `watchlist`

### 6.7 Thesis Lifecycle Layer

Responsibilities:

- assign thesis state;
- compute dynamic expiry;
- compute freshness score;
- define machine-checkable triggers;
- update state when market conditions change;
- schedule partial or full revalidation.

States:

- `draft`
- `active`
- `stale`
- `invalidated`
- `upgraded`
- `closed`
- `archived`

Trigger severities:

- `observe`
- `recheck`
- `downgrade`
- `invalidate`
- `escalate`

### 6.8 Audit And Governance Layer

Responsibilities:

- log every prompt, model version, tool version, input, output, claim packet, critique, synthesis, veto, override, and approval;
- support deterministic replay for frozen evidence;
- support export for review;
- track model and persona calibration over time.

## 7. Data Contracts

### 7.1 EvidenceItem

```json
{
  "id": "ev_001",
  "kind": "price | filing | news | macro | event | portfolio | broker_constraint | user_mandate",
  "source": "vendor_or_url",
  "symbol": "NVDA",
  "as_of": "2026-05-01T14:30:00Z",
  "retrieved_at": "2026-05-01T14:31:00Z",
  "freshness_status": "fresh | stale | unknown",
  "license": "public | internal | restricted",
  "payload_ref": "object_or_file_ref",
  "hash": "sha256"
}
```

### 7.2 ToolOutput

```json
{
  "id": "tool_001",
  "tool_name": "volatility_check",
  "tool_version": "0.1.0",
  "inputs": ["ev_001"],
  "created_at": "2026-05-01T14:31:10Z",
  "status": "passed | warning | failed",
  "result": {},
  "result_hash": "sha256"
}
```

### 7.3 PersonaClaimPacket

```json
{
  "id": "claim_001",
  "persona_id": "portfolio_risk_manager",
  "stance": "support | oppose | abstain | needs_more_data",
  "confidence": 0.0,
  "claim_type": "fact | calculation | inference | hypothesis | risk | invalidator",
  "thesis": "short claim",
  "evidence_refs": ["ev_001", "tool_001"],
  "assumptions": [],
  "base_rates": [],
  "invalidators": [],
  "risks": [],
  "required_checks": [],
  "proposed_action": "no_trade | research_needed | watchlist | paper_trade_candidate | order_ticket_candidate",
  "veto": {
    "active": false,
    "reason": ""
  }
}
```

### 7.4 ThesisTrigger

```json
{
  "id": "trig_001",
  "kind": "observe | recheck | downgrade | invalidate | escalate",
  "condition_type": "price | volatility | liquidity | news | event | portfolio | regime | correlation | time",
  "condition": "machine_checkable_expression",
  "human_rationale": "Why this condition matters",
  "linked_assumption": "assumption_id",
  "last_checked_at": "2026-05-01T14:31:20Z"
}
```

### 7.5 ThesisLifecycle

```json
{
  "dossier_id": "dos_001",
  "state": "active",
  "valid_as_of": "2026-05-01T14:31:30Z",
  "expires_at": "2026-05-01T20:00:00Z",
  "freshness_score": 0.91,
  "dependency_refs": ["NVDA", "SMH", "QQQ", "US10Y"],
  "triggers": ["trig_001"],
  "last_revalidated_at": "2026-05-01T14:31:30Z"
}
```

### 7.6 DecisionPacket

```json
{
  "id": "dp_001",
  "dossier_id": "dos_001",
  "action_class": "watchlist",
  "thesis_state": "active",
  "confidence": 0.62,
  "freshness_score": 0.91,
  "confidence_cap_reason": "portfolio_concentration",
  "vetoes": [],
  "dissent": ["red_team_skeptic"],
  "invalidators": ["trig_001"],
  "next_review_trigger": "price_breaks_vwap_or_news_event",
  "audit_bundle_ref": "audit_001"
}
```

## 8. Hard Veto Rules

The decision gate must block escalation if any condition is true:

- stale, missing, conflicting, or legally unusable data;
- restricted/security-list conflict;
- user mandate or suitability conflict;
- unsupported numeric claim central to the thesis;
- unknown or unacceptable liquidity/slippage;
- position size breaches risk, leverage, margin, drawdown, or concentration limits;
- strategy failed validation or is materially drifting;
- suspected manipulation, insider-information issue, or deceptive source;
- model output cannot be reconstructed;
- thesis is stale or invalidated;
- required revalidation failed or has not completed;
- live execution controls are unavailable.

## 9. Confidence And Freshness

Confidence and freshness are separate.

Confidence measures how well the thesis is supported.

Freshness measures whether the evidence snapshot still describes the current market.

The system must never treat high confidence as actionable when freshness is low.

## 10. Security And Safety Requirements

- External text must be treated as untrusted data.
- Tools must be allowlisted per persona.
- Personas cannot directly mutate orders, lifecycle state, or audit logs.
- All state transitions must pass through deterministic services.
- Prompt-injection test fixtures must be part of CI.
- Secrets and broker credentials must never be exposed to council prompts.

## 11. MVP Functional Requirements

The MVP must:

1. create a dossier from a user thesis;
2. freeze a local fixture evidence snapshot;
3. run deterministic analytics on fixture data;
4. run six MVP personas;
5. produce schema-valid claim packets;
6. synthesize bull case, bear case, dissent, and action class;
7. apply hard vetoes and action ceiling;
8. assign lifecycle state, expiry, and static triggers;
9. persist audit bundle;
10. replay a dossier from frozen inputs.

## 12. MVP Acceptance Tests

The MVP is acceptable when:

- schema validation passes for every core object;
- stale evidence downgrades or vetoes action;
- unsupported numeric claims are rejected;
- red-team dissent appears in the final dossier;
- a stale or invalidated thesis cannot be upgraded;
- audit replay reconstructs the same decision packet;
- no execution/broker code path exists in MVP.

## 13. Later-Phase Requirements

Later phases add:

- real data adapters;
- dynamic market-state sentinel;
- trigger replay engine;
- paper-trade simulator;
- outcome attribution;
- model registry;
- monitoring dashboards;
- broker integration behind approval gates;
- live execution controls only after validation.

## 14. Open Decisions

- Final product name.
- Initial asset class for real data integration.
- Initial market data vendor.
- Whether first UI should be CLI, local web app, or notebook-style analyst console.
- Whether personas should run through one model or a small validated model ensemble.

## 15. Canonical Principle

Parallax should make unsupported conviction hard to hide.

Every thesis must be evidence-linked, challenged, vetoable, monitored, expiring, and replayable.
