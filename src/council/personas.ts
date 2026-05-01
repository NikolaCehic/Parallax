import { makeId, clamp } from "../core/ids.js";
import { toolByName } from "../analytics/run.js";

function claim({
  personaId,
  stance,
  confidence,
  claimType = "inference",
  thesis,
  evidenceRefs,
  assumptions = [],
  baseRates = [],
  invalidators = [],
  risks = [],
  requiredChecks = [],
  proposedAction,
  veto = { active: false, reason: "" }
}) {
  const body = {
    persona_id: personaId,
    stance,
    confidence: clamp(confidence),
    claim_type: claimType,
    thesis,
    evidence_refs: evidenceRefs,
    assumptions,
    base_rates: baseRates,
    invalidators,
    risks,
    required_checks: requiredChecks,
    proposed_action: proposedAction,
    veto
  };
  return {
    id: makeId("claim", body),
    ...body
  };
}

function refs(...outputs) {
  return outputs.filter(Boolean).map((output) => output.id);
}

export const PERSONAS = [
  "regime_cartographer",
  "quant_researcher",
  "fundamental_analyst",
  "technical_microstructure_analyst",
  "macro_cross_asset_analyst",
  "sentiment_news_analyst",
  "data_quality_officer",
  "portfolio_risk_manager",
  "execution_specialist",
  "compliance_conflicts_officer",
  "model_validator",
  "red_team_skeptic"
];

export function runPersona(personaId, { snapshot, toolOutputs }) {
  const returns = toolByName(toolOutputs, "return_summary");
  const vol = toolByName(toolOutputs, "volatility_check");
  const drawdown = toolByName(toolOutputs, "drawdown_check");
  const liquidity = toolByName(toolOutputs, "liquidity_check");
  const costs = toolByName(toolOutputs, "transaction_cost_model");
  const exposure = toolByName(toolOutputs, "portfolio_exposure_check");
  const event = toolByName(toolOutputs, "event_calendar_check");
  const dataQuality = toolByName(toolOutputs, "data_quality_check");
  const corr = toolOutputs.filter((output) => output.tool_name === "dependency_correlation");

  const symbol = snapshot.question.symbol;
  const horizon = snapshot.question.horizon;
  const momentum = returns.result.momentum_20;
  const oneDay = returns.result.one_day_return;
  const highVol = vol.result.high_volatility;
  const concentrationBreach = exposure.result.concentration_breach;
  const staleData = dataQuality.status !== "passed";
  const highEventRisk = event.result.material_event_count > 0;
  const expensiveTrade = costs.result.estimated_spread_bps + costs.result.estimated_slippage_bps > 90;

  switch (personaId) {
    case "regime_cartographer":
      return claim({
        personaId,
        stance: highVol ? "oppose" : "support",
        confidence: highVol ? 0.54 : 0.62,
        thesis: highVol
          ? `${symbol} is in a high-volatility state; continuation theses need tighter freshness and smaller action class.`
          : `${symbol} does not show an extreme volatility regime in the current snapshot.`,
        evidenceRefs: refs(vol, corr[0]),
        assumptions: ["Regime proxy uses realized volatility and dependency correlation."],
        risks: highVol ? ["Regime transition risk", "Signal decay risk"] : ["Regime classifier is deliberately simple in v0."],
        invalidators: ["Volatility regime changes materially."],
        proposedAction: highVol ? "research_needed" : "watchlist"
      });
    case "quant_researcher":
      return claim({
        personaId,
        stance: momentum > 0.04 && !highVol ? "support" : "needs_more_data",
        confidence: momentum > 0.04 && !highVol ? 0.68 : 0.47,
        claimType: "calculation",
        thesis: momentum > 0.04
          ? `The 20-period momentum is positive, but the edge remains conditional on costs, volatility, and confirmation.`
          : `The current momentum evidence is not strong enough to support escalation.`,
        evidenceRefs: refs(returns, vol, drawdown),
        assumptions: ["Momentum proxy is a first-pass signal, not a validated strategy."],
        baseRates: ["Backtest/walk-forward module is required before paper escalation."],
        invalidators: ["Momentum turns negative.", "Volatility expands beyond threshold."],
        risks: ["Overfitting risk", "Momentum reversal risk"],
        requiredChecks: ["Walk-forward validation before production use."],
        proposedAction: momentum > 0.04 && !highVol ? "watchlist" : "research_needed"
      });
    case "fundamental_analyst":
      return claim({
        personaId,
        stance: highEventRisk ? "needs_more_data" : "abstain",
        confidence: highEventRisk ? 0.55 : 0.38,
        thesis: highEventRisk
          ? `Material scheduled events exist for ${symbol}; fundamental interpretation must wait for the event or include event-specific scenarios.`
          : `No high-materiality event is present in the fixture snapshot; fundamental evidence is limited in v0.`,
        evidenceRefs: refs(event),
        assumptions: ["Fixture fundamental data is intentionally minimal."],
        invalidators: ["New filing, guidance, or earnings event changes the premise."],
        risks: ["Fundamental data sparsity"],
        requiredChecks: ["Add filings/earnings adapter before stronger fundamental claims."],
        proposedAction: highEventRisk ? "research_needed" : "watchlist"
      });
    case "technical_microstructure_analyst":
      return claim({
        personaId,
        stance: oneDay > 0 && liquidity.status === "passed" && !expensiveTrade ? "support" : "oppose",
        confidence: oneDay > 0 && liquidity.status === "passed" ? 0.64 : 0.5,
        thesis: oneDay > 0 && liquidity.status === "passed"
          ? `Technical conditions are constructive, with positive latest return and acceptable liquidity proxy.`
          : `Entry quality is not clean enough; price action, liquidity, or cost proxy argues for caution.`,
        evidenceRefs: refs(returns, liquidity, costs),
        assumptions: ["Technical analysis uses simple price/volume proxies in v0."],
        invalidators: ["Price loses the trigger level.", "Liquidity deteriorates.", "Cost estimate widens."],
        risks: ["False breakout", "Adverse selection near volatile opens"],
        proposedAction: oneDay > 0 && liquidity.status === "passed" && !expensiveTrade ? "watchlist" : "no_trade"
      });
    case "macro_cross_asset_analyst":
      return claim({
        personaId,
        stance: corr.some((output) => Math.abs(output.result.correlation_60) > 0.8) ? "needs_more_data" : "abstain",
        confidence: 0.44,
        thesis: `Cross-asset context is approximated through dependency correlations; macro evidence is not yet rich enough for strong claims.`,
        evidenceRefs: refs(...corr),
        assumptions: ["Dependency correlation is a proxy for cross-asset sensitivity."],
        invalidators: ["Sector ETF or benchmark breaks correlation regime."],
        risks: ["Hidden factor concentration", "Macro surprise risk"],
        requiredChecks: ["Rates, FX, and macro calendar adapters."],
        proposedAction: "watchlist"
      });
    case "sentiment_news_analyst":
      return claim({
        personaId,
        stance: highEventRisk ? "needs_more_data" : "abstain",
        confidence: 0.42,
        thesis: highEventRisk
          ? `Event risk is present; news monitoring should be active before any escalation.`
          : `News and sentiment are not deeply integrated in v0, so no strong sentiment claim is made.`,
        evidenceRefs: refs(event),
        assumptions: ["Event calendar is a proxy until news ingestion is connected."],
        invalidators: ["Material news arrives.", "Source reliability changes."],
        risks: ["Narrative crowding", "Deceptive source risk"],
        requiredChecks: ["News provenance adapter."],
        proposedAction: highEventRisk ? "research_needed" : "watchlist"
      });
    case "data_quality_officer":
      return claim({
        personaId,
        stance: staleData ? "oppose" : "support",
        confidence: staleData ? 0.9 : 0.8,
        claimType: "fact",
        thesis: staleData ? "Evidence snapshot has stale or restricted inputs." : "Evidence snapshot passes v0 freshness checks.",
        evidenceRefs: refs(dataQuality),
        invalidators: ["Any central data item becomes stale, missing, restricted, or conflicting."],
        risks: staleData ? ["Stale evidence risk"] : ["Vendor caveats still apply."],
        proposedAction: staleData ? "no_trade" : "watchlist",
        veto: staleData ? { active: true, reason: "Data quality check failed." } : { active: false, reason: "" }
      });
    case "portfolio_risk_manager":
      return claim({
        personaId,
        stance: concentrationBreach || highVol ? "oppose" : "support",
        confidence: concentrationBreach ? 0.86 : 0.68,
        claimType: "risk",
        thesis: concentrationBreach
          ? "Portfolio concentration limits are already breached or too close for escalation."
          : "Portfolio risk allows watchlist-level consideration, subject to sizing and freshness.",
        evidenceRefs: refs(exposure, vol, drawdown),
        assumptions: ["Risk limits come from fixture portfolio profile."],
        invalidators: ["Exposure increases.", "Drawdown or volatility breaches threshold."],
        risks: ["Concentration risk", "Correlation clustering", "Gap risk"],
        proposedAction: concentrationBreach ? "no_trade" : "watchlist",
        veto: concentrationBreach ? { active: true, reason: "Portfolio concentration breach." } : { active: false, reason: "" }
      });
    case "execution_specialist":
      return claim({
        personaId,
        stance: expensiveTrade || liquidity.status !== "passed" ? "oppose" : "support",
        confidence: expensiveTrade ? 0.72 : 0.61,
        claimType: "risk",
        thesis: expensiveTrade
          ? "Cost and liquidity proxy is too expensive for escalation."
          : "Execution proxy is acceptable for watchlist or paper-trade analysis.",
        evidenceRefs: refs(liquidity, costs),
        assumptions: ["Execution model is a range-based proxy until venue/order-book data exists."],
        invalidators: ["Spread widens.", "Relative volume collapses.", "Slippage estimate rises."],
        risks: ["Slippage", "Poor fill assumptions"],
        proposedAction: expensiveTrade ? "research_needed" : "watchlist"
      });
    case "compliance_conflicts_officer": {
      const portfolioItem = snapshot.items.find((item) => item.kind === "portfolio");
      const restricted = portfolioItem.payload.restricted_symbols?.includes(symbol);
      return claim({
        personaId,
        stance: restricted ? "oppose" : "support",
        confidence: restricted ? 0.95 : 0.75,
        claimType: "fact",
        thesis: restricted ? `${symbol} is restricted by the current portfolio profile.` : "No fixture restricted-list conflict is present.",
        evidenceRefs: [portfolioItem.id],
        assumptions: ["Fixture restricted list represents the active mandate for this prototype."],
        invalidators: ["Restricted list changes.", "Mandate constraints change."],
        risks: restricted ? ["Restricted security conflict"] : ["Compliance data must stay fresh."],
        proposedAction: restricted ? "no_trade" : "watchlist",
        veto: restricted ? { active: true, reason: "Restricted symbol conflict." } : { active: false, reason: "" }
      });
    }
    case "model_validator":
      return claim({
        personaId,
        stance: "support",
        confidence: 0.7,
        claimType: "fact",
        thesis: "The v0 deterministic rule council is registered as a prototype model and is replayable from audit bundles.",
        evidenceRefs: refs(dataQuality),
        assumptions: ["This is a prototype validator; production requires a model registry and validation report."],
        invalidators: ["Unregistered model or prompt configuration is used.", "Replay fails."],
        risks: ["Prototype validation scope"],
        requiredChecks: ["Governance phase validation before production deployment."],
        proposedAction: "watchlist"
      });
    case "red_team_skeptic":
      return claim({
        personaId,
        stance: momentum > 0.15 || highEventRisk || highVol ? "oppose" : "needs_more_data",
        confidence: momentum > 0.15 || highEventRisk || highVol ? 0.76 : 0.58,
        claimType: "invalidator",
        thesis: `The strongest countercase is that this thesis is chasing already-visible price action without enough validated edge.`,
        evidenceRefs: refs(returns, vol, event, exposure),
        assumptions: ["Red-team role intentionally stresses downside and overconfidence."],
        invalidators: ["Confirmation fails.", "Event risk changes premise.", "Portfolio exposure worsens."],
        risks: ["Headline chasing", "Crowded trade", "Unvalidated edge"],
        requiredChecks: ["Define confirmation and kill conditions before action."],
        proposedAction: momentum > 0.15 || highEventRisk || highVol ? "research_needed" : "watchlist"
      });
    default:
      throw new Error(`Unknown persona: ${personaId}`);
  }
}
