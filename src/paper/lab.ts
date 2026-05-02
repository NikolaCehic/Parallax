import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeId, isoNow } from "../core/ids.js";
import { readAuditBundle } from "../audit.js";
import { calibrationReport } from "../governance/registry.js";
import {
  attributePaperOutcome,
  closePaperTrade,
  createPaperTicket,
  simulatePaperFill
} from "./trading.js";

export const PAPER_LEDGER_FILE = "paper-ledger.json";

const SIMULATION_DISCLOSURE = "Paper trading is simulation only; outcomes do not prove future live performance and cannot unlock live execution.";

async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function exposureCheck(dossier: any) {
  return dossier.tool_outputs.find((output: any) => output.tool_name === "portfolio_exposure_check").result;
}

function latestClose(dossier: any) {
  return dossier.tool_outputs.find((output: any) => output.tool_name === "return_summary").result.latest_close;
}

function defaultLedger(auditDir: string) {
  return {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    created_at: isoNow(),
    simulation_only: true,
    live_execution_unlocked: false,
    disclosure: SIMULATION_DISCLOSURE,
    trades: [],
    reviews: []
  };
}

function openTrades(ledger: any) {
  return ledger.trades.filter((trade: any) => trade.status === "open");
}

function closedTrades(ledger: any) {
  return ledger.trades.filter((trade: any) => trade.status === "closed");
}

function reservedNotional(ledger: any) {
  return Number(openTrades(ledger).reduce((sum: number, trade: any) => sum + (trade.reserved_notional ?? 0), 0).toFixed(2));
}

function paperRiskCap(dossier: any) {
  const exposure = exposureCheck(dossier);
  return Number((exposure.total_equity * exposure.paper_risk_budget_pct).toFixed(2));
}

function assertRiskBudgetAvailable(ledger: any, dossier: any, ticket: any) {
  const cap = paperRiskCap(dossier);
  const reserved = reservedNotional(ledger);
  const remaining = Number((cap - reserved).toFixed(2));
  if (ticket.notional > remaining) {
    throw new Error(`Paper risk budget exceeded: ticket ${ticket.notional} exceeds remaining ${remaining} of cap ${cap}.`);
  }
}

function enrichTicket(ticket: any, dossier: any, auditPath: string, now: string) {
  return {
    ...ticket,
    order_type: "market_simulated",
    time_in_force: "paper_day",
    invalidation_ref: dossier.decision_packet.next_review_trigger,
    audit_path: auditPath,
    simulation_only: true,
    live_execution_unlocked: false,
    disclosure: SIMULATION_DISCLOSURE,
    lab_created_at: now
  };
}

export async function loadPaperLedger(auditDir = "audits") {
  const ledger = await readJsonIfExists(path.join(auditDir, PAPER_LEDGER_FILE), defaultLedger(auditDir));
  return {
    ...defaultLedger(auditDir),
    ...ledger,
    audit_dir: auditDir,
    simulation_only: true,
    live_execution_unlocked: false,
    disclosure: SIMULATION_DISCLOSURE,
    trades: ledger.trades ?? [],
    reviews: ledger.reviews ?? []
  };
}

export async function savePaperLedger(auditDir: string, ledger: any) {
  const next = {
    ...ledger,
    schema_version: "0.1.0",
    audit_dir: auditDir,
    updated_at: isoNow(),
    simulation_only: true,
    live_execution_unlocked: false,
    disclosure: SIMULATION_DISCLOSURE
  };
  await writeJson(path.join(auditDir, PAPER_LEDGER_FILE), next);
  return next;
}

export async function openPaperTrade({
  auditPath,
  auditDir = path.dirname(auditPath),
  side = "buy",
  riskBudgetPct,
  marketPrice,
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  side?: string;
  riskBudgetPct?: number;
  marketPrice?: number;
  now?: string;
}) {
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const ledger = await loadPaperLedger(auditDir);
  const ticket = enrichTicket(createPaperTicket(dossier, { side, riskBudgetPct, now }), dossier, auditPath, now);
  assertRiskBudgetAvailable(ledger, dossier, ticket);
  const filled = simulatePaperFill(ticket, { marketPrice: marketPrice ?? latestClose(dossier), now });
  const tradeBody = {
    dossier_id: dossier.id,
    audit_path: auditPath,
    symbol: dossier.symbol,
    side,
    opened_at: now,
    status: "open",
    ticket,
    filled,
    reserved_notional: filled.fill_notional,
    risk_budget_cap: paperRiskCap(dossier),
    simulation_only: true,
    live_execution_unlocked: false
  };
  const trade = {
    id: makeId("paper_trade", tradeBody),
    ...tradeBody
  };
  const next = await savePaperLedger(auditDir, {
    ...ledger,
    trades: [...ledger.trades, trade]
  });
  return {
    audit_dir: auditDir,
    ledger_path: path.join(auditDir, PAPER_LEDGER_FILE),
    trade,
    ledger_summary: summarizePaperLedger(next),
    disclosure: SIMULATION_DISCLOSURE
  };
}

export async function closeLedgerTrade({
  auditDir = "audits",
  tradeId,
  exitPrice,
  now = isoNow(),
  reason = "manual_close"
}: {
  auditDir?: string;
  tradeId: string;
  exitPrice: number;
  now?: string;
  reason?: string;
}) {
  const ledger = await loadPaperLedger(auditDir);
  const trade = ledger.trades.find((item: any) => item.id === tradeId);
  if (!trade) throw new Error(`Unknown paper trade ${tradeId}.`);
  if (trade.status !== "open") throw new Error(`Paper trade ${tradeId} is not open.`);
  const bundle = await readAuditBundle(trade.audit_path);
  const closed = closePaperTrade(trade.filled, { exitPrice, now, reason });
  const attribution = attributePaperOutcome(bundle.dossier, closed);
  const nextTrade = {
    ...trade,
    status: "closed",
    closed,
    attribution,
    closed_at: now,
    realized_pnl: closed.realized_pnl,
    realized_return: closed.realized_return,
    reserved_notional: 0,
    live_execution_unlocked: false
  };
  const next = await savePaperLedger(auditDir, {
    ...ledger,
    trades: ledger.trades.map((item: any) => item.id === tradeId ? nextTrade : item)
  });
  return {
    audit_dir: auditDir,
    ledger_path: path.join(auditDir, PAPER_LEDGER_FILE),
    trade: nextTrade,
    ledger_summary: summarizePaperLedger(next),
    disclosure: SIMULATION_DISCLOSURE
  };
}

export async function recordPaperReview({
  auditDir = "audits",
  tradeId,
  reviewer = "paper_lab_user",
  rating,
  notes = "",
  now = isoNow()
}: {
  auditDir?: string;
  tradeId: string;
  reviewer?: string;
  rating: string;
  notes?: string;
  now?: string;
}) {
  const ledger = await loadPaperLedger(auditDir);
  const trade = ledger.trades.find((item: any) => item.id === tradeId);
  if (!trade) throw new Error(`Unknown paper trade ${tradeId}.`);
  const reviewBody = {
    trade_id: tradeId,
    dossier_id: trade.dossier_id,
    symbol: trade.symbol,
    reviewer,
    rating,
    notes,
    created_at: now
  };
  const review = {
    id: makeId("paper_review", reviewBody),
    ...reviewBody
  };
  const next = await savePaperLedger(auditDir, {
    ...ledger,
    reviews: [...ledger.reviews, review]
  });
  return {
    audit_dir: auditDir,
    ledger_path: path.join(auditDir, PAPER_LEDGER_FILE),
    review,
    ledger_summary: summarizePaperLedger(next)
  };
}

function cumulativeDrawdown(trades: any[]) {
  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  for (const trade of trades) {
    equity += trade.realized_pnl ?? trade.closed?.realized_pnl ?? 0;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);
  }
  return Number(maxDrawdown.toFixed(2));
}

export function summarizePaperLedger(ledger: any) {
  const open = openTrades(ledger);
  const closed = closedTrades(ledger);
  const realizedPnl = Number(closed.reduce((sum: number, trade: any) => sum + (trade.realized_pnl ?? 0), 0).toFixed(2));
  const wins = closed.filter((trade: any) => (trade.realized_pnl ?? 0) > 0).length;
  const losses = closed.filter((trade: any) => (trade.realized_pnl ?? 0) < 0).length;
  const turnover = Number(ledger.trades.reduce((sum: number, trade: any) =>
    sum + (trade.filled?.fill_notional ?? trade.ticket?.notional ?? 0) + (trade.closed?.fill_notional ?? 0),
  0).toFixed(2));
  const bySymbol: Record<string, any> = {};
  for (const trade of ledger.trades) {
    bySymbol[trade.symbol] = bySymbol[trade.symbol] ?? { open_count: 0, closed_count: 0, realized_pnl: 0, reserved_notional: 0 };
    if (trade.status === "open") {
      bySymbol[trade.symbol].open_count += 1;
      bySymbol[trade.symbol].reserved_notional += trade.reserved_notional ?? 0;
    }
    if (trade.status === "closed") {
      bySymbol[trade.symbol].closed_count += 1;
      bySymbol[trade.symbol].realized_pnl += trade.realized_pnl ?? 0;
    }
  }
  for (const value of Object.values(bySymbol) as any[]) {
    value.realized_pnl = Number(value.realized_pnl.toFixed(2));
    value.reserved_notional = Number(value.reserved_notional.toFixed(2));
  }
  return {
    audit_dir: ledger.audit_dir,
    trade_count: ledger.trades.length,
    open_count: open.length,
    closed_count: closed.length,
    review_count: ledger.reviews?.length ?? 0,
    reserved_notional: reservedNotional(ledger),
    realized_pnl: realizedPnl,
    win_rate: closed.length ? Number((wins / closed.length).toFixed(4)) : 0,
    loss_count: losses,
    average_realized_return: closed.length
      ? Number((closed.reduce((sum: number, trade: any) => sum + (trade.realized_return ?? 0), 0) / closed.length).toFixed(5))
      : 0,
    max_drawdown: cumulativeDrawdown(closed),
    turnover_notional: turnover,
    by_symbol: bySymbol,
    simulation_only: true,
    live_execution_unlocked: false,
    disclosure: SIMULATION_DISCLOSURE
  };
}

export async function paperLedgerReport(auditDir = "audits") {
  const ledger = await loadPaperLedger(auditDir);
  const closed = closedTrades(ledger);
  const dossiers = [];
  for (const trade of ledger.trades) {
    try {
      const bundle = await readAuditBundle(trade.audit_path);
      dossiers.push(bundle.dossier);
    } catch {
      // Keep the paper ledger readable even if an old audit path is missing.
    }
  }
  return {
    ledger,
    summary: summarizePaperLedger(ledger),
    calibration: calibrationReport(dossiers, closed.map((trade: any) => trade.closed ?? trade)),
    open_trades: openTrades(ledger),
    closed_trades: closed,
    reviews: ledger.reviews ?? []
  };
}

export function paperSimulationDisclosure() {
  return SIMULATION_DISCLOSURE;
}
