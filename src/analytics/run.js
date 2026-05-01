import { makeId, stableHash, isoNow, clamp } from "../core/ids.js";
import { getEvidence } from "../evidence/store.js";
import { returns, mean, stddev, maxDrawdown, correlation, last } from "./indicators.js";

function toolOutput({ toolName, inputs, result, status = "passed", now = isoNow() }) {
  const body = {
    tool_name: toolName,
    tool_version: "0.1.0",
    inputs: inputs.map((input) => input.id),
    created_at: now,
    status,
    result
  };
  return {
    id: makeId("tool", body),
    ...body,
    result_hash: stableHash(result)
  };
}

function mainPrice(snapshot) {
  return getEvidence(snapshot, "price", snapshot.question.symbol);
}

function portfolio(snapshot) {
  return getEvidence(snapshot, "portfolio", "PORTFOLIO");
}

function events(snapshot) {
  return getEvidence(snapshot, "event", snapshot.question.symbol);
}

export function runAnalytics(snapshot, { now = isoNow() } = {}) {
  const priceEvidence = mainPrice(snapshot);
  const portfolioEvidence = portfolio(snapshot);
  const eventEvidence = events(snapshot);
  const candles = priceEvidence.payload;
  const ret = returns(candles);
  const latest = last(candles);
  const previous = candles.at(-2);
  const momentum20 = candles.length >= 21 ? (latest.close - candles.at(-21).close) / candles.at(-21).close : (latest.close - candles[0].close) / candles[0].close;
  const dailyVol = stddev(ret.slice(-20));
  const annualizedVol = dailyVol * Math.sqrt(252);
  const avgVolume20 = mean(candles.slice(-20).map((candle) => candle.volume));
  const relVolume = latest.volume / Math.max(avgVolume20, 1);
  const rangePct = (latest.high - latest.low) / latest.close;
  const drawdown = maxDrawdown(candles);

  const outputs = [
    toolOutput({
      toolName: "return_summary",
      inputs: [priceEvidence],
      now,
      result: {
        latest_close: latest.close,
        one_day_return: previous ? (latest.close - previous.close) / previous.close : 0,
        momentum_20: momentum20,
        sample_size: candles.length
      }
    }),
    toolOutput({
      toolName: "volatility_check",
      inputs: [priceEvidence],
      now,
      result: {
        daily_volatility_20: dailyVol,
        annualized_volatility_20: annualizedVol,
        high_volatility: annualizedVol > 0.65
      },
      status: annualizedVol > 0.85 ? "warning" : "passed"
    }),
    toolOutput({
      toolName: "drawdown_check",
      inputs: [priceEvidence],
      now,
      result: {
        max_drawdown: drawdown,
        severe_drawdown: drawdown < -0.25
      },
      status: drawdown < -0.35 ? "warning" : "passed"
    }),
    toolOutput({
      toolName: "liquidity_check",
      inputs: [priceEvidence],
      now,
      result: {
        average_volume_20: Math.round(avgVolume20),
        latest_volume: latest.volume,
        relative_volume: relVolume,
        range_pct: rangePct,
        liquidity_score: clamp(Math.log10(Math.max(avgVolume20, 1)) / 8)
      },
      status: avgVolume20 < 500000 ? "warning" : "passed"
    }),
    toolOutput({
      toolName: "transaction_cost_model",
      inputs: [priceEvidence],
      now,
      result: {
        estimated_spread_bps: Math.round(Math.max(2, rangePct * 1200)),
        estimated_slippage_bps: Math.round(Math.max(3, rangePct * 900)),
        cost_model: "range_proxy_v0"
      }
    })
  ];

  const dependencyItems = snapshot.items.filter((item) => item.kind === "price" && item.symbol !== snapshot.question.symbol);
  for (const dependency of dependencyItems.slice(0, 2)) {
    const depReturns = returns(dependency.payload);
    outputs.push(toolOutput({
      toolName: "dependency_correlation",
      inputs: [priceEvidence, dependency],
      now,
      result: {
        dependency: dependency.symbol,
        correlation_60: correlation(ret.slice(-60), depReturns.slice(-60))
      }
    }));
  }

  const positions = portfolioEvidence.payload.positions ?? [];
  const constraints = portfolioEvidence.payload.constraints ?? {};
  const totalEquity = portfolioEvidence.payload.total_equity ?? portfolioEvidence.payload.cash ?? 100000;
  const existingPosition = positions.find((position) => position.symbol === snapshot.question.symbol);
  const existingPct = existingPosition ? existingPosition.market_value / totalEquity : 0;
  const sectorPct = positions
    .filter((position) => position.sector && position.sector === "semiconductors")
    .reduce((sum, position) => sum + position.market_value / totalEquity, 0);

  outputs.push(toolOutput({
    toolName: "portfolio_exposure_check",
    inputs: [portfolioEvidence],
    now,
    result: {
      total_equity: totalEquity,
      existing_symbol_exposure_pct: existingPct,
      semiconductor_exposure_pct: sectorPct,
      max_single_name_pct: constraints.max_single_name_pct ?? 0.12,
      max_sector_pct: constraints.max_sector_pct ?? 0.35,
      paper_risk_budget_pct: constraints.paper_risk_budget_pct ?? 0.02,
      concentration_breach: existingPct > (constraints.max_single_name_pct ?? 0.12) || sectorPct > (constraints.max_sector_pct ?? 0.35)
    },
    status: existingPct > (constraints.max_single_name_pct ?? 0.12) || sectorPct > (constraints.max_sector_pct ?? 0.35) ? "warning" : "passed"
  }));

  const upcomingEvents = eventEvidence.payload.filter((event) => new Date(event.date).getTime() >= new Date(now).getTime());
  outputs.push(toolOutput({
    toolName: "event_calendar_check",
    inputs: [eventEvidence],
    now,
    result: {
      upcoming_events: upcomingEvents,
      material_event_count: upcomingEvents.filter((event) => event.materiality === "high").length
    },
    status: upcomingEvents.some((event) => event.materiality === "high") ? "warning" : "passed"
  }));

  const staleItems = snapshot.items.filter((item) => item.freshness_status !== "fresh");
  outputs.push(toolOutput({
    toolName: "data_quality_check",
    inputs: snapshot.items,
    now,
    result: {
      stale_item_ids: staleItems.map((item) => item.id),
      restricted_license_item_ids: snapshot.items.filter((item) => item.license === "restricted").map((item) => item.id),
      passed: staleItems.length === 0
    },
    status: staleItems.length > 0 ? "warning" : "passed"
  }));

  return outputs;
}

export function toolByName(toolOutputs, toolName) {
  return toolOutputs.find((output) => output.tool_name === toolName);
}
