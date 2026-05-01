import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThesis } from "../src/index.js";
import { createPaperTicket, simulatePaperFill, closePaperTrade, attributePaperOutcome } from "../src/paper/trading.js";
import { ApprovalStore, KillSwitch, SandboxBroker } from "../src/execution/sandbox.js";

test("paper ticket requires paper action class", async () => {
  const watchlist = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "watchlist only",
    now: "2026-05-01T14:30:00Z",
    actionCeiling: "watchlist"
  });

  assert.throws(() => createPaperTicket(watchlist), /below paper-trade threshold/);
});

test("paper trading and attribution work after paper gate", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "paper candidate",
    now: "2026-05-01T14:30:00Z",
    actionCeiling: "paper_trade_candidate"
  });

  assert.equal(dossier.action_class, "paper_trade_candidate");
  const ticket = createPaperTicket(dossier);
  const filled = simulatePaperFill(ticket, { marketPrice: 115 });
  const closed = closePaperTrade(filled, { exitPrice: 118 });
  const attribution = attributePaperOutcome(dossier, closed);
  assert.equal(ticket.status, "created");
  assert.equal(filled.status, "filled");
  assert.equal(closed.status, "closed");
  assert.ok(attribution.realized_pnl > 0);
});

test("sandbox execution requires approval and respects kill switch", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "sandbox candidate",
    now: "2026-05-01T14:30:00Z",
    actionCeiling: "paper_trade_candidate"
  });
  const ticket = createPaperTicket(dossier);
  const approvalStore = new ApprovalStore();
  const killSwitch = new KillSwitch();
  const broker = new SandboxBroker({ approvalStore, killSwitch });

  assert.throws(() => broker.submit({ dossier, ticket, now: "2026-05-01T14:31:00Z" }), /no approval/);
  approvalStore.approve(ticket, { approver: "human", now: "2026-05-01T14:31:00Z" });
  killSwitch.activate("test");
  assert.throws(() => broker.submit({ dossier, ticket, now: "2026-05-01T14:32:00Z" }), /Kill switch active/);
  killSwitch.deactivate();
  const submitted = broker.submit({ dossier, ticket, now: "2026-05-01T14:32:00Z" });
  assert.equal(submitted.status, "submitted_to_sandbox");
});
