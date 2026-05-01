# Parallax

Parallax is a governed trading-thesis council and lifecycle monitor.

It turns a market question or candidate trade into an auditable Trade Thesis Dossier. Deterministic tools own the numbers, expert personas own interpretation and critique, hard vetoes control escalation, and a lifecycle engine keeps every thesis temporary, monitored, expiring, and revalidated as markets change.

This repository is an implementation prototype, not investment advice and not a live trading system.

## What It Does

Parallax answers:

> Is this thesis supported, unsupported, stale, invalidated, too risky, worth watching, or suitable for paper-trade testing under the current evidence snapshot?

The current implementation includes:

- TypeScript orchestration, contracts, CLI, council, lifecycle, governance, and execution gates;
- Python deterministic analytics worker for quant-style calculations;
- evidence snapshots with provenance and freshness;
- deterministic analytics for returns, volatility, drawdown, liquidity, costs, exposure, events, and data quality;
- 12 persona council roles;
- cross-examination and dissent-preserving synthesis;
- decision gate with hard vetoes and action ceilings;
- thesis lifecycle state machine and trigger evaluation;
- audit bundle write/replay;
- paper-trade ticket, fill, close, and attribution helpers;
- governance registry and release validation;
- sandbox-only broker workflow with approval and kill switch.

## Quick Start

```bash
npm install
npm test
npm run demo
```

Parallax uses Python for analytics. By default it runs `python3`; set `PARALLAX_PYTHON` only when you want to point it at a specific interpreter.

Run a custom analysis:

```bash
npm run analyze -- \
  --symbol NVDA \
  --horizon swing \
  --thesis "post-earnings continuation with controlled risk" \
  --ceiling watchlist \
  --now 2026-05-01T14:30:00Z
```

Replay an audit bundle:

```bash
node dist/src/cli/parallax.js replay --audit audits/dos_1554fa9a5dd2.json
```

Evaluate lifecycle triggers:

```bash
node dist/src/cli/parallax.js monitor \
  --audit audits/dos_1554fa9a5dd2.json \
  --price 111 \
  --now 2026-05-01T15:00:00Z
```

## Architecture

```text
User Request
  -> Intake
  -> Evidence Snapshot
  -> Python Deterministic Analytics
  -> Independent Council
  -> Cross-Examination
  -> Synthesis
  -> Decision Gate
  -> Lifecycle Assignment
  -> Audit Bundle
  -> Monitor/Revalidate
```

## Action Classes

- `no_trade`
- `research_needed`
- `watchlist`
- `paper_trade_candidate`
- `order_ticket_candidate`

The default ceiling is `watchlist`. Paper and sandbox execution paths must be explicitly enabled by action ceiling and gates. There is no live broker integration in this prototype.

## Important Docs

- [TradeAgent/SPEC.md](TradeAgent/SPEC.md): canonical specification.
- [TradeAgent/PHASED_IMPLEMENTATION_PLAN.md](TradeAgent/PHASED_IMPLEMENTATION_PLAN.md): phased roadmap.
- [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md): current build status against each phase.
- [TradeAgent/best_solution.md](TradeAgent/best_solution.md): converged architecture notes.

## Safety Position

Parallax is designed to make unsupported conviction hard to hide.

Every thesis must be evidence-linked, challenged, vetoable, monitored, expiring, and replayable.
