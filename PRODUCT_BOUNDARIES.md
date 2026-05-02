# Parallax Product Boundaries

Status: implemented product safety kernel
Date: 2026-05-02

Parallax is a governed trading-thesis research product. It is not a live trading bot, broker, registered adviser substitute, signal seller, or guarantee engine.

The product boundary is enforced in code by `src/product/policy.ts` and surfaced through:

- `node dist/src/cli/parallax.js policy`
- the `policy_review` object in every dossier
- the `council_run.eval_report` object in every dossier
- the human-readable analysis report
- the decision gate's policy vetoes
- the local library's `policy_status` and `policy_ceiling` fields

## Public Positioning

Use:

> Parallax is a research accountability platform for trading ideas. It turns a thesis into an evidence-linked dossier, challenges assumptions, surfaces invalidators, and monitors whether the thesis remains defensible.

Avoid:

- AI stock picker
- AI trading signal
- AI that tells you what to buy
- autonomous trading agent
- guaranteed-alpha engine
- adviser replacement

## Allowed Product Actions

General product ceiling:

```text
no_trade
research_needed
watchlist
paper_trade_candidate
```

Excluded from the general product:

```text
order_ticket_candidate
live_execution
broker_submission
autonomous_trading
```

Execution can only be considered later as a regulated-partner workflow with explicit human approval, pre-trade controls, kill switch, audit, and legal/compliance sign-off.

## User Classes

Current allowed user-class labels:

- `self_directed_investor`
- `independent_analyst`
- `research_team`
- `trading_educator`
- `professional_reviewer`

Current intended-use labels:

- `research`
- `education`
- `paper_trading`
- `team_review`
- `governance_review`

These labels do not make Parallax a broker or adviser. They help the product keep outputs inside the correct research boundary.

## Prohibited Claims

Do not claim:

- Parallax predicts markets.
- Parallax guarantees profit or avoids loss.
- Parallax tells users what to buy or sell.
- Parallax replaces a financial adviser, broker, risk manager, or compliance reviewer.
- Parallax can safely execute live trades without explicit human and regulated partner controls.
- Paper-trading or backtest outcomes prove future live performance.

## Request Handling

The product policy reviews every thesis request before the decision gate.

It detects:

- buy/sell oracle framing
- live-execution requests
- guaranteed-return language
- adviser-substitution framing
- requested action ceilings above the general product ceiling

It can return:

- `allowed`: request is inside the research-support boundary
- `needs_reframe`: request can be answered only as research, not as advice or instruction
- `blocked`: request is outside the product boundary and must not escalate

Blocked requests become `no_trade` dossiers with policy vetoes.

## Council Evaluation Boundary

The current council is deterministic, but it now runs behind a provider boundary so future LLM claim packets can be validated before they affect the decision gate.

The evaluation checks:

- claim-packet schema validity
- evidence and tool-output references
- calculation claims with tool-output support
- warnings when proposed actions exceed the effective product ceiling

If a council provider fails evaluation, the decision gate can add a model veto and fail closed.

## Local Alpha Workspace

Every analysis now creates a local workspace entry:

- audit JSON
- markdown dossier
- `library.json`
- optional feedback JSONL
- optional workspace export
- optional static dashboard HTML

Useful commands:

```bash
node dist/src/cli/parallax.js library --audit-dir audits
node dist/src/cli/parallax.js watchlist --audit-dir audits
node dist/src/cli/parallax.js alerts --audit-dir audits --prices NVDA=111
node dist/src/cli/parallax.js sources --audit audits/dos_x.json
node dist/src/cli/parallax.js data-status --symbol NVDA --data-dir data
node dist/src/cli/parallax.js portfolio-import --csv broker.csv --out data/portfolio/default.json
node dist/src/cli/parallax.js feedback --audit audits/dos_x.json --rating useful
node dist/src/cli/parallax.js feedback-summary --audit-dir audits
node dist/src/cli/parallax.js export --audit-dir audits --out parallax-workspace.json
node dist/src/cli/parallax.js import --in parallax-workspace.json --audit-dir imported-audits
node dist/src/cli/parallax.js app --audit-dir audits --out audits/parallax-dashboard.html
```

The local workspace is the first productized surface: it gives alpha users a repeatable research loop without adding cloud data risk.
