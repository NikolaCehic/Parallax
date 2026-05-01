import { makeId, isoNow, clamp } from "../core/ids.js";
import { ACTION_RANK } from "../core/schemas.js";

function latestClose(dossier) {
  return dossier.tool_outputs.find((output) => output.tool_name === "return_summary").result.latest_close;
}

function exposureCheck(dossier) {
  return dossier.tool_outputs.find((output) => output.tool_name === "portfolio_exposure_check").result;
}

function costModel(dossier) {
  return dossier.tool_outputs.find((output) => output.tool_name === "transaction_cost_model").result;
}

export function createPaperTicket(dossier, {
  side = "buy",
  riskBudgetPct,
  now = isoNow()
} = {}) {
  if (dossier.lifecycle.state !== "active") {
    throw new Error(`Cannot create paper ticket from ${dossier.lifecycle.state} thesis.`);
  }
  if (ACTION_RANK.get(dossier.decision_packet.action_class) < ACTION_RANK.get("paper_trade_candidate")) {
    throw new Error(`Action class ${dossier.decision_packet.action_class} is below paper-trade threshold.`);
  }
  if (dossier.decision_packet.vetoes.length > 0) {
    throw new Error("Cannot create paper ticket with active vetoes.");
  }

  const exposure = exposureCheck(dossier);
  const price = latestClose(dossier);
  const budgetPct = clamp(riskBudgetPct ?? exposure.paper_risk_budget_pct ?? 0.02, 0, exposure.paper_risk_budget_pct ?? 0.02);
  const notional = exposure.total_equity * budgetPct;
  const quantity = Math.max(1, Math.floor(notional / price));
  const costs = costModel(dossier);

  const body = {
    dossier_id: dossier.id,
    symbol: dossier.symbol,
    side,
    quantity,
    reference_price: price,
    notional: Number((quantity * price).toFixed(2)),
    status: "created",
    created_at: now,
    fill_model: {
      type: "next_bar_with_cost_proxy",
      estimated_spread_bps: costs.estimated_spread_bps,
      estimated_slippage_bps: costs.estimated_slippage_bps
    }
  };

  return {
    id: makeId("paper_ticket", body),
    ...body
  };
}

export function simulatePaperFill(ticket, { marketPrice, now = isoNow() } = {}) {
  const direction = ticket.side === "buy" ? 1 : -1;
  const totalBps = ticket.fill_model.estimated_spread_bps + ticket.fill_model.estimated_slippage_bps;
  const fillPrice = (marketPrice ?? ticket.reference_price) * (1 + direction * totalBps / 10000);
  return {
    ...ticket,
    status: "filled",
    filled_at: now,
    fill_price: Number(fillPrice.toFixed(2)),
    fill_notional: Number((fillPrice * ticket.quantity).toFixed(2))
  };
}

export function closePaperTrade(filledTicket, { exitPrice, now = isoNow(), reason = "manual_close" }) {
  if (filledTicket.status !== "filled") throw new Error("Paper trade must be filled before close.");
  const direction = filledTicket.side === "buy" ? 1 : -1;
  const pnl = (exitPrice - filledTicket.fill_price) * filledTicket.quantity * direction;
  return {
    ...filledTicket,
    status: "closed",
    closed_at: now,
    exit_price: exitPrice,
    realized_pnl: Number(pnl.toFixed(2)),
    realized_return: Number((pnl / filledTicket.fill_notional).toFixed(5)),
    close_reason: reason
  };
}

export function attributePaperOutcome(dossier, closedTrade) {
  const thesisWorked = closedTrade.realized_pnl > 0;
  const invalidated = dossier.lifecycle.state === "invalidated";
  return {
    dossier_id: dossier.id,
    paper_ticket_id: closedTrade.id,
    realized_pnl: closedTrade.realized_pnl,
    realized_return: closedTrade.realized_return,
    thesis_quality: thesisWorked ? "supported_by_outcome" : "not_supported_by_outcome",
    timing_quality: closedTrade.realized_return > 0.01 ? "good" : closedTrade.realized_return < -0.01 ? "poor" : "neutral",
    sizing_quality: closedTrade.notional <= exposureCheck(dossier).total_equity * exposureCheck(dossier).paper_risk_budget_pct ? "within_budget" : "over_budget",
    execution_quality: closedTrade.fill_model.type,
    process_note: invalidated ? "Thesis was invalidated during lifecycle evaluation." : "Outcome linked to original active dossier."
  };
}
