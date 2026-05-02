# Parallax

Parallax is an experimental trading-thesis analysis agent.

It does not try to be a magic trading bot. It takes a market idea, gathers evidence, runs deterministic analytics, asks a council of specialized reviewers to challenge the idea, then returns a clear decision dossier with risks, vetoes, invalidation triggers, and next steps.

The goal is simple:

> Make unsupported conviction hard to hide.

Parallax is a prototype. It is not investment advice, not a live trading system, and not connected to a real broker.

## Why This Exists

Most trading tools either give you numbers without enough judgment, or persuasive narratives without enough proof.

Parallax tries to sit in the middle:

- Python calculates the market facts.
- TypeScript orchestrates the agent workflow.
- Specialist personas review the thesis from different angles.
- Hard gates stop bad data, bad risk, restricted symbols, stale theses, and unsafe escalation.
- A lifecycle engine keeps every thesis temporary, monitored, and invalidatable.

Instead of asking:

> Is this stock good?

Parallax asks:

> Is this specific thesis, at this specific time, with this evidence and portfolio context, still justified?

## What It Produces

When you analyze a thesis, Parallax creates a **Trade Thesis Dossier**.

The dossier includes:

- the original thesis;
- a frozen evidence snapshot;
- deterministic analytics;
- council review;
- strongest bull case;
- strongest bear case;
- required checks;
- hard vetoes, if any;
- action class;
- confidence and freshness;
- lifecycle triggers;
- audit JSON;
- markdown report.

Example action classes:

- `no_trade`: blocked or not worth pursuing;
- `research_needed`: interesting, but missing evidence;
- `watchlist`: valid enough to monitor, not executable;
- `paper_trade_candidate`: eligible for simulation only;
- `order_ticket_candidate`: future permissioned mode, still requiring approval.

## How The Pipeline Works

```text
User thesis
  -> Evidence snapshot
  -> Python analytics
  -> Council personas
  -> Cross-examination
  -> Synthesis
  -> Decision gate
  -> Lifecycle engine
  -> Audit bundle
  -> Optional paper/sandbox path
```

The important design choice: generated reasoning does not own the numbers. The Python analytics worker produces the calculations. The council can interpret and challenge those results, but numeric claims must be tied back to tool outputs.

## Current Architecture

Parallax is split between TypeScript and Python.

TypeScript owns:

- CLI;
- schemas and contracts;
- evidence orchestration;
- council personas;
- cross-examination;
- synthesis;
- decision gates;
- lifecycle state;
- audit replay;
- paper trading;
- sandbox execution controls.

Python owns:

- returns;
- volatility;
- drawdown;
- liquidity checks;
- transaction-cost proxy;
- dependency correlation;
- portfolio exposure checks;
- event filtering;
- data-quality checks.

## Quick Start

Requirements:

- Node.js 20+
- npm
- Python 3 available as `python3`

Install and test:

```bash
npm install
npm test
```

Run the demo:

```bash
npm run demo
```

Run your own thesis:

```bash
npm run analyze --silent -- \
  --symbol NVDA \
  --horizon swing \
  --thesis "post-earnings continuation with controlled risk" \
  --ceiling watchlist \
  --now 2026-05-01T14:30:00Z
```

Show the product boundary:

```bash
npm run policy
```

By default, Parallax prints a human-readable report with the full workflow:

```text
Parallax Analysis
=================

Input
Pipeline Steps
Decision
Key Numbers
Council Result
Strongest Bull Case
Strongest Bear Case
Vetoes
Required Checks
Lifecycle Triggers
Outputs
Next Commands
```

For scripts or automation, use JSON output:

```bash
npm run analyze --silent -- \
  --symbol NVDA \
  --horizon swing \
  --thesis "post-earnings continuation with controlled risk" \
  --json
```

## Local Alpha Workspace

Every CLI analysis writes an audit bundle, markdown dossier, and local library entry.

List saved dossiers:

```bash
npm run cli -- library --audit-dir audits
```

Show active watchlist and paper-trade candidates:

```bash
npm run cli -- watchlist --audit-dir audits
```

Scan the workspace for theses that need attention:

```bash
npm run cli -- alerts \
  --audit-dir audits \
  --prices NVDA=111,TSLA=240
```

Inspect the exact evidence and tool-output hashes behind a dossier:

```bash
npm run cli -- sources --audit audits/dos_x.json
```

Record alpha feedback:

```bash
npm run cli -- feedback \
  --audit audits/dos_x.json \
  --rating useful \
  --notes "clear invalidators"
```

Export the local workspace:

```bash
npm run cli -- export \
  --audit-dir audits \
  --out parallax-workspace.json
```

Import a portable workspace:

```bash
npm run cli -- import \
  --in parallax-workspace.json \
  --audit-dir imported-audits
```

Summarize alpha feedback:

```bash
npm run cli -- feedback-summary --audit-dir audits
```

Generate a local dashboard:

```bash
npm run app -- \
  --audit-dir audits \
  --out audits/parallax-dashboard.html
```

The local workspace is intentionally file-based. It is easy to inspect, easy to delete, and does not require a cloud account.

## Data-Backed Research

Parallax can read a local licensed data pack with market, fundamentals, events, news, corporate actions, and portfolio data.

Expected local data layout:

```text
data/
  manifest.json
  market/NVDA.csv
  fundamentals/NVDA.json
  events/NVDA.json
  news/NVDA.json
  actions/NVDA.json
  portfolio/default.json
```

Check data freshness and licensing:

```bash
npm run data-status -- \
  --symbol NVDA \
  --data-dir data \
  --now 2026-05-01T14:30:00Z
```

Import a broker-style portfolio CSV:

```bash
npm run cli -- portfolio-import \
  --csv broker.csv \
  --out data/portfolio/default.json \
  --account-id local_broker_export
```

Run a data-backed dossier:

```bash
npm run analyze --silent -- \
  --symbol NVDA \
  --thesis "data-backed continuation thesis" \
  --data-dir data \
  --ceiling paper_trade_candidate
```

If you need a specific Python interpreter:

```bash
PARALLAX_PYTHON=/path/to/python3 npm test
```

## Example Output

A successful watchlist result looks like this:

```text
Decision
  Action class: WATCHLIST
  Thesis state: active
  Confidence: 0.63
  Freshness: 1
  Confidence cap: required_checks
  Next review trigger: Volatility regime changes materially.

Strongest Bull Case
  The 20-period momentum is positive, but the edge remains conditional on costs, volatility, and confirmation.

Strongest Bear Case
  The strongest countercase is that this thesis is chasing already-visible price action without enough validated edge.
```

This means Parallax is not saying “buy.” It is saying:

> This thesis is currently worth watching, but it has required checks and can become stale or invalidated.

## Monitoring A Thesis

Every dossier has lifecycle triggers. For example, a thesis may invalidate if price breaks below a threshold.

Replay an audit bundle:

```bash
node dist/src/cli/parallax.js replay --audit audits/dos_x.json
```

Check whether market movement changes the thesis state:

```bash
node dist/src/cli/parallax.js monitor \
  --audit audits/dos_x.json \
  --price 111 \
  --now 2026-05-01T15:00:00Z
```

If a trigger fires, Parallax may return:

```text
Current state: invalidated

Interpretation
  This thesis is no longer actionable until a new analysis is run.
```

## Paper And Sandbox Modes

Parallax includes paper-trading and sandbox execution helpers, but they are intentionally gated.

Paper tickets require:

- an active thesis;
- no hard vetoes;
- an action class of `paper_trade_candidate`;
- risk budget checks.

Sandbox submission requires:

- a paper-style ticket;
- approval;
- unexpired approval;
- active lifecycle state;
- pre-trade controls;
- kill switch not active.

There is no live broker integration in this prototype.

## Testing

Run:

```bash
npm test
```

The suite currently includes 35 tests:

- CLI human-output tests;
- JSON output tests;
- product-boundary tests;
- council-provider evaluation tests;
- local workspace tests;
- Phase 1 local-alpha E2E tests;
- Phase 2 data-backed research E2E tests;
- synthetic end-to-end scenarios;
- stale-data veto tests;
- restricted-symbol veto tests;
- concentration-risk tests;
- high-volatility dissent tests;
- future/past event handling tests;
- lifecycle invalidation tests;
- audit replay tests;
- paper-trading tests;
- sandbox approval and kill-switch tests.

The synthetic E2E suite creates temporary market, event, and portfolio data, then runs the full TypeScript + Python pipeline.

More detail: [E2E_TESTING.md](E2E_TESTING.md)

## Repository Map

```text
src/
  app/            Static local alpha dashboard generator
  analytics/      TypeScript bridge to Python analytics
  cli/            Parallax CLI
  core/           IDs, schemas, shared contracts
  council/        Personas and council runner
  data/           Local data adapters, portfolio import, freshness status
  decision/       Decision gate
  evidence/       Evidence loading and snapshots
  execution/      Sandbox execution controls
  governance/     Registry and calibration helpers
  lifecycle/      Thesis state and trigger engine
  library/        Local dossier library, source view, feedback, export
  paper/          Paper-trading helpers
  product/        Product boundary and prohibited-claim policy

python/
  parallax_analytics.py

fixtures/
  market/
  events/
  portfolio/

tests/
  CLI, E2E, lifecycle, governance, product, workspace, paper, and pipeline tests

TradeAgent/
  design specs, iteration logs, and phased implementation plans
```

## Design Docs

- [SPEC.md](TradeAgent/SPEC.md)
- [Phased Implementation Plan](TradeAgent/PHASED_IMPLEMENTATION_PLAN.md)
- [Implementation Status](IMPLEMENTATION_STATUS.md)
- [E2E Testing](E2E_TESTING.md)
- [Productization Plan](PRODUCTIZATION_PLAN.md)
- [Product Boundaries](PRODUCT_BOUNDARIES.md)
- [Best Solution Notes](TradeAgent/best_solution.md)

## Safety Boundaries

Parallax is intentionally conservative.

It can say:

- no trade;
- research needed;
- watchlist;
- paper-trade candidate.

It should not pretend to know the future. It should not hide uncertainty. It should not turn generated prose into live orders.

Current intentional limits:

- no live broker integration;
- no external market data vendor yet;
- no LLM API integration yet;
- no tax/legal/compliance advice;
- no claim of trading profitability.

These are safety boundaries, not accidental omissions.

## Status

Current state:

- TypeScript + Python prototype;
- human-readable CLI;
- machine-readable JSON mode;
- product-boundary policy;
- council provider/evaluation boundary;
- local dossier library;
- source viewer;
- workspace lifecycle alerts;
- portable workspace import/export;
- local dashboard generator;
- market, fundamentals, news, event, corporate-action, and portfolio adapters;
- data freshness status;
- portfolio CSV import;
- alpha feedback capture;
- deterministic analytics;
- full audit replay;
- lifecycle monitoring;
- paper and sandbox paths;
- 35 passing tests.

Within the prototype scope, Parallax is designed to answer:

> Given the current evidence, what is the most defensible action class for this thesis, and what would prove it wrong?
