# Current Best Solution

Working name: Parallax, CBS-120. Final product name still open, but Parallax fits the multiaxial nature of the system.

## One-Sentence Architecture

Build a governed trading-analysis harness where deterministic tools produce and verify market facts, a multiaxial council generates and attacks trade theses, and a living thesis lifecycle engine keeps every conclusion conditional, monitored, expiring, and subject to veto before it can become a watchlist item, paper trade, or explicitly approved order ticket.

## Core Principle

The harness should be excellent at analysis before it is allowed anywhere near execution.

Generated reasoning can frame hypotheses, compare interpretations, and surface overlooked risks. It must not be the sole source of prices, position sizing, backtest results, portfolio risk, compliance status, or order placement.

## System Layers

1. Evidence layer
   - Ingest market data, fundamentals, macro data, filings, news, portfolio state, broker constraints, and user mandates.
   - Normalize timestamps, symbols, corporate actions, and data licenses.
   - Attach provenance to every fact: source, retrieval time, freshness, confidence, and allowed use.

2. Deterministic analytics layer
   - Pricing, returns, volatility, factor exposures, drawdown, beta, VaR/CVaR, liquidity, slippage, transaction costs, backtests, walk-forward tests, stress tests, and portfolio optimization.
   - All numeric claims from personas must cite a tool output or be flagged as unverified.

3. Council layer
   - Expert personas are bounded analytical roles with tool permissions, rubrics, and required output schemas.
   - Personas do not "vote from vibes." They submit evidence-linked claim packets.

4. Debate and synthesis layer
   - Run independent first-pass analysis.
   - Run cross-examination where personas must attack assumptions, data quality, base rates, and invalidation conditions.
   - Run synthesis that preserves dissent instead of smoothing it away.

5. Decision gate
   - Outputs one of: no trade, research needed, watchlist, paper trade candidate, or approved order-ticket candidate.
   - Data quality, risk, compliance, and model validation roles have hard veto power.

6. Execution boundary
   - Default mode stops at analysis.
   - Paper trading is the first executable mode.
   - Live execution, if ever enabled, requires broker-side controls, pre-trade limits, kill switch, human approval, and post-trade review.

7. Governance and monitoring
   - Log prompts, model versions, data snapshots, tool outputs, persona outputs, dissent, final decision packets, approvals, overrides, and post-outcome attribution.
   - Monitor drift, performance decay, hallucination rate, data failures, rejected recommendations, and risk-limit near misses.

8. Thesis lifecycle layer
   - Every dossier is a stateful object, not a static answer.
   - Track status: draft, active, stale, invalidated, upgraded, closed, or archived.
   - Attach dynamic expiry, revalidation triggers, machine-checkable invalidators, and dependency links to related assets, factors, events, and portfolio exposures.

## Multiaxial Paradigms

The council should not merely contain "experts." It should cover orthogonal axes of market interpretation:

- time horizon: intraday, swing, medium-term, long-term;
- method: fundamental, technical, statistical, macro, sentiment, flow, microstructure;
- asset lens: equities, options, futures, FX, crypto, fixed income, cross-asset;
- regime lens: trend, mean reversion, crisis, liquidity shock, earnings/event, policy transition;
- uncertainty lens: probabilistic, scenario-based, robust/minimax, Bayesian update;
- risk lens: position risk, portfolio risk, liquidity risk, operational risk, model risk, compliance risk;
- execution lens: order type, venue, spread, queue, market impact, borrow, margin, fees;
- behavioral lens: positioning, reflexivity, narrative crowding, incentives, sentiment extremes;
- validity lens: data freshness, survivorship bias, lookahead bias, overfitting, source reliability;
- mandate lens: user constraints, suitability, concentration, drawdown tolerance, tax/account restrictions.

## Expert Personas

Minimum council:

1. Regime Cartographer
   - Identifies current market regime and which strategies are likely brittle in it.

2. Quant Researcher
   - Checks signal definition, statistical evidence, base rates, robustness, and overfitting risk.

3. Fundamental Analyst
   - Reviews valuation, earnings quality, balance-sheet pressure, industry structure, and catalysts.

4. Technical and Microstructure Analyst
   - Reviews trend, levels, volume, volatility, liquidity, spreads, order-book and execution fragility.

5. Macro and Cross-Asset Analyst
   - Reviews rates, inflation, policy, FX, commodities, credit, correlations, and factor rotations.

6. Sentiment and News Analyst
   - Reviews news provenance, event risk, narrative crowding, social/media anomalies, and fraud risk.

7. Portfolio Risk Manager
   - Converts thesis risk into position sizing, portfolio exposure, drawdown, correlation, and stop logic.

8. Execution Specialist
   - Tests whether the trade can actually be entered/exited at plausible costs and constraints.

9. Compliance and Conflicts Officer
   - Checks restricted lists, suitability/mandate constraints, conflicts, disclosures, recordkeeping, and prohibited behavior.

10. Data Quality Officer
   - Checks stale data, missing fields, symbol mapping, corporate actions, vendor disagreement, and license constraints.

11. Model Validator
   - Reviews model assumptions, validation status, tool versions, monitoring status, and drift.

12. Red Team Skeptic
   - Argues the strongest case that the entire recommendation is wrong, unsafe, or overfit.

Optional specialist personas can be added by asset class: Options Volatility, Credit, Crypto Market Structure, Tax, ESG, Corporate Actions, ETF/Flow, or Short-Borrow.

## Persona Output Contract

Every persona returns a claim packet:

```json
{
  "role": "Portfolio Risk Manager",
  "stance": "support | oppose | abstain | needs_more_data",
  "confidence": 0.0,
  "time_horizon": "intraday | swing | medium | long",
  "thesis": "short human-readable claim",
  "evidence_refs": ["tool_output_id", "source_id"],
  "assumptions": ["explicit assumption"],
  "base_rates": ["historical comparison or unavailable"],
  "invalidators": ["condition that would make the thesis false"],
  "risks": ["specific risk"],
  "required_checks": ["calculation or review still needed"],
  "proposed_action": "no_trade | research_needed | watchlist | paper_trade_candidate | order_ticket_candidate",
  "veto": {
    "active": false,
    "reason": ""
  }
}
```

## Council Protocol

1. Intake
   - User asks a question or submits a candidate trade.
   - Harness resolves mandate, account context, asset class, horizon, and whether execution is even in scope.

2. Evidence build
   - Fetch and freeze a data snapshot.
   - Run quality checks and required deterministic calculations.

3. Independent analysis
   - Each persona receives the same evidence packet and works independently.
   - No persona sees another persona's first-pass conclusion.

4. Cross-examination
   - Personas inspect each other's assumptions, missing evidence, and invalidators.
   - Red Team, Data Quality, Risk, Compliance, and Model Validator are prompted to find reasons to block.

5. Synthesis
   - Synthesizer builds a decision memo with explicit dissent.
   - Confidence is capped by the weakest non-vetoed critical axis, not averaged across optimistic opinions.

6. Gate
   - Hard vetoes stop the action path.
   - Soft concerns downgrade action class.
   - No trade is a valid and common output.

7. Output
   - Human-readable memo.
   - Machine-readable decision packet.
   - Audit bundle with full evidence trail.

8. Follow-through
   - Watchlist items get recheck triggers.
   - Paper trades get outcome attribution.
   - Any live-order candidate requires an explicit approval workflow.

9. Lifecycle monitoring
   - A deterministic market-state sentinel watches prices, volatility, liquidity, spreads, news, events, regime labels, correlations, portfolio exposure, and risk limits.
   - Minor changes update freshness and status.
   - Material changes trigger partial revalidation.
   - Hard invalidators trigger downgrade, invalidation, or escalation.

## Thesis Lifecycle Engine

Markets move continuously, so the council output must decay unless reality keeps confirming it.

Each dossier has:

- `valid_as_of`: when the evidence snapshot was frozen;
- `expires_at`: dynamic expiry based on horizon, volatility, liquidity, event risk, and action class;
- `freshness_score`: evidence age plus market drift since the snapshot;
- `status`: draft, active, stale, invalidated, upgraded, closed, or archived;
- `recheck_triggers`: conditions that require updated analysis;
- `confirmation_triggers`: conditions that can upgrade a watchlist thesis;
- `invalidation_triggers`: conditions that kill or downgrade the thesis;
- `dependency_graph`: linked tickers, sector ETFs, factors, rates, FX, commodities, portfolio positions, and scheduled events.

Trigger severity:

- Observe: record the change but do not rerun the council.
- Recheck: rerun only affected tools or personas.
- Downgrade: reduce action class until reviewed.
- Invalidate: mark thesis inactive and block action.
- Escalate: notify the human reviewer or approval owner.

This makes the system honest about time. A thesis is never simply "true"; it is active only while its assumptions survive.

## Decision Classes

- No trade: thesis invalid, risk/reward weak, data poor, mandate conflict, or no edge after costs.
- Research needed: potentially interesting but blocked by missing evidence or unresolved conflict.
- Watchlist: no immediate action, but clear trigger conditions exist.
- Paper trade candidate: passes analysis and risk gates, suitable for simulated execution.
- Order-ticket candidate: fully specified ticket that still requires human approval and broker-side controls.

## Thesis States

- Draft: analysis is being assembled.
- Active: thesis is valid under its current evidence snapshot and trigger rules.
- Stale: evidence age or market drift exceeded the allowed threshold.
- Invalidated: one or more kill conditions fired.
- Upgraded: watchlist/research thesis met confirmation conditions and deserves renewed council review.
- Closed: trade, paper trade, or thesis cycle ended and attribution is complete.
- Archived: retained for audit and calibration.

## Hard Vetoes

Any one of these blocks escalation:

- stale, missing, or legally unusable data;
- restricted/security-list conflict;
- unsupported numeric claim central to the thesis;
- unknown or unacceptable liquidity/slippage;
- position size breaches exposure, drawdown, leverage, concentration, or margin limits;
- strategy failed required validation or has material drift;
- suspected market manipulation, insider-information concern, or deceptive source;
- model output cannot be reconstructed from logged inputs;
- user mandate/suitability conflict;
- live execution path lacks kill switch or pre-trade controls.
- thesis is stale or invalidated;
- required revalidation failed or has not completed.

## Confidence Method

Do not average persona confidence.

Use constrained confidence:

1. start with the thesis evidence score from deterministic tests;
2. reduce for data quality problems;
3. reduce for market regime mismatch;
4. reduce for execution friction;
5. reduce for portfolio concentration;
6. reduce for unresolved dissent;
7. cap at zero if any hard veto fires.

The result should be a decision confidence, not a price-prediction certainty.

## Freshness Method

Do not confuse confidence with freshness.

Freshness answers: "Is the evidence snapshot still representative of the market?"

It is reduced by:

1. time elapsed since snapshot;
2. price movement beyond thesis-specific bands;
3. volatility, spread, or liquidity regime change;
4. material news or filing arrival;
5. macro/event surprise;
6. portfolio exposure change;
7. related asset, sector, factor, or correlation break.

A high-confidence thesis with low freshness is not actionable. It must be revalidated.

## Minimum Viable Build

Phase 1:

- file-based evidence store;
- market data adapter;
- deterministic analytics notebook or service;
- six personas: Quant, Fundamental, Technical, Risk, Compliance, Red Team;
- structured JSON claim packets;
- thesis state machine;
- static revalidation triggers;
- no execution, only memos.

Phase 2:

- backtest and walk-forward harness;
- model registry;
- data quality gates;
- dynamic freshness scoring;
- event and trigger monitor;
- paper-trading adapter;
- post-trade attribution.

Phase 3:

- broker integration behind a permissioned execution boundary;
- human approval workflow;
- pre-trade limits, kill switch, and incident runbooks;
- correlation-aware trigger propagation;
- continuous monitoring and periodic model validation.

## Product Shape

The user-facing object should be a "Trade Thesis Dossier":

- question asked;
- frozen evidence snapshot;
- council summary;
- strongest bull case;
- strongest bear case;
- invalidation triggers;
- risk and sizing envelope;
- expected costs and liquidity notes;
- action class;
- thesis state and freshness;
- exact reasons for vetoes or downgrades;
- next review trigger.

## The Final Design Bet

The best harness is not the one that sounds most like a brilliant trader. It is the one that makes weak evidence, hidden assumptions, and unsafe action paths hard to hide.
