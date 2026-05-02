import { makeId, clamp, daysBetween, isoNow } from "../core/ids.js";
import { toolByName } from "../analytics/run.js";

function expiryHoursForHorizon(horizon) {
  switch (horizon) {
    case "intraday":
      return 1;
    case "swing":
      return 24;
    case "medium":
      return 24 * 7;
    case "long":
      return 24 * 30;
    default:
      return 24;
  }
}

function addHours(iso, hours) {
  return new Date(new Date(iso).getTime() + hours * 60 * 60 * 1000).toISOString();
}

export function createLifecycleTrigger({ kind, conditionType, condition, rationale, linkedAssumption = "" }) {
  const body = {
    kind,
    condition_type: conditionType,
    condition,
    human_rationale: rationale,
    linked_assumption: linkedAssumption
  };
  return {
    id: makeId("trig", body),
    ...body
  };
}

export function assignLifecycle({ dossierId, snapshot, toolOutputs, decisionPacket, now = isoNow() }) {
  const returns = toolByName(toolOutputs, "return_summary");
  const volatility = toolByName(toolOutputs, "volatility_check");
  const event = toolByName(toolOutputs, "event_calendar_check");
  const price = returns.result.latest_close;
  const vol = Math.max(volatility.result.daily_volatility_20, 0.01);
  const horizon = snapshot.question.horizon;
  const expiryHours = expiryHoursForHorizon(horizon) * (event.status === "warning" ? 0.5 : 1);
  const hasVeto = decisionPacket.vetoes.length > 0;
  const state = hasVeto || decisionPacket.action_class === "no_trade" ? "invalidated" : "active";
  const priceBand = Number((price * Math.max(vol * 2.5, 0.025)).toFixed(2));
  const lower = Number((price - priceBand).toFixed(2));
  const upper = Number((price + priceBand).toFixed(2));

  const triggers = [
    createLifecycleTrigger({
      kind: "invalidate",
      conditionType: "price",
      condition: `last_price < ${lower}`,
      rationale: "Price moved below the thesis invalidation band.",
      linkedAssumption: "price_structure_holds"
    }),
    createLifecycleTrigger({
      kind: "recheck",
      conditionType: "price",
      condition: `last_price > ${upper}`,
      rationale: "Price moved enough to require a new risk/reward check.",
      linkedAssumption: "entry_quality_remains_reasonable"
    }),
    createLifecycleTrigger({
      kind: "downgrade",
      conditionType: "volatility",
      condition: `annualized_volatility_20 > ${Math.max(0.85, volatility.result.annualized_volatility_20 * 1.5).toFixed(3)}`,
      rationale: "Volatility expanded beyond the allowed thesis envelope.",
      linkedAssumption: "volatility_regime_stable"
    }),
    createLifecycleTrigger({
      kind: "downgrade",
      conditionType: "time",
      condition: `now > ${addHours(now, expiryHours)}`,
      rationale: "Evidence snapshot expired for this horizon.",
      linkedAssumption: "evidence_still_fresh"
    })
  ];

  if (event.result.material_event_count > 0) {
    triggers.push(createLifecycleTrigger({
      kind: "escalate",
      conditionType: "event",
      condition: "material_event_arrives == true",
      rationale: "Material event risk can change the thesis premise.",
      linkedAssumption: "event_risk_unchanged"
    }));
  }

  return {
    dossier_id: dossierId,
    state,
    valid_as_of: now,
    expires_at: addHours(now, expiryHours),
    freshness_score: state === "invalidated" ? 0 : 1,
    dependency_refs: [snapshot.question.symbol, ...(snapshot.question.dependencies ?? [])],
    triggers,
    last_revalidated_at: now
  };
}

function evaluateExpression(condition, marketState) {
  const match = condition.match(/^([a-zA-Z0-9_]+)\s*([<>=!]+)\s*(.+)$/);
  if (!match) return false;
  const [, field, operator, raw] = match;
  const left = field === "now" ? new Date(marketState.now).getTime() : marketState[field];
  let right;
  if (raw === "true") right = true;
  else if (raw === "false") right = false;
  else {
    const parsedRight = raw.includes("T") ? new Date(raw).getTime() : Number(raw);
    right = Number.isNaN(parsedRight) ? raw.replace(/^"|"$/g, "") : parsedRight;
  }
  switch (operator) {
    case "<": return left < right;
    case ">": return left > right;
    case "<=": return left <= right;
    case ">=": return left >= right;
    case "==": return left === right;
    case "!=": return left !== right;
    default: return false;
  }
}

export function evaluateLifecycle(lifecycle, marketState) {
  const fired = lifecycle.triggers.filter((candidate) => evaluateExpression(candidate.condition, marketState));
  let state = lifecycle.state;
  let freshnessScore = lifecycle.freshness_score;

  const agePenalty = Math.max(0, daysBetween(lifecycle.valid_as_of, marketState.now ?? isoNow()) / 7);
  freshnessScore = clamp(freshnessScore - agePenalty);

  if (fired.some((item) => item.kind === "invalidate")) state = "invalidated";
  else if (fired.some((item) => item.kind === "downgrade")) state = "stale";
  else if (fired.some((item) => item.kind === "recheck")) state = "stale";
  else if (fired.some((item) => item.kind === "escalate")) {
    state = marketState.upgrade_on_escalate === true ? "upgraded" : "stale";
  }

  if (new Date(marketState.now ?? isoNow()).getTime() > new Date(lifecycle.expires_at).getTime()) {
    state = state === "invalidated" ? "invalidated" : "stale";
    freshnessScore = Math.min(freshnessScore, 0.3);
  }

  return {
    ...lifecycle,
    state,
    freshness_score: state === "invalidated" ? 0 : Number(freshnessScore.toFixed(3)),
    fired_triggers: fired,
    last_checked_at: marketState.now ?? isoNow()
  };
}
