# Phase 2 Data-Backed Research App Report

Status: complete
Date: 2026-05-02

## Phase Goal

Connect Parallax to data-backed research inputs so dossiers can use market data, fundamentals, events, news provenance, portfolio context, corporate actions, freshness, and licensing metadata.

## Implemented

- Market data adapter for local licensed OHLCV CSV files
- Fundamentals adapter for JSON financial snapshots
- Event calendar adapter
- News/provenance adapter with source reliability and sentiment
- Corporate-action adapter with split adjustment handling
- Portfolio CSV import for broker-style exports
- Data freshness and license status command
- Source viewer upgrade with payload summaries and freshness/license breakdowns
- Dashboard data freshness section
- Python analytics outputs for fundamentals, news provenance, and corporate actions
- Council personas updated to use fundamentals/news/corporate-action tool outputs
- Phase 2 smoke and E2E tests

## Commands Added

```bash
npm run data-status -- --symbol NVDA --data-dir data
npm run cli -- portfolio-import --csv broker.csv --out data/portfolio/default.json
```

## Generated Artifacts

- `artifacts/phase_2_data_backed_research_app/data/`
- `artifacts/phase_2_data_backed_research_app/data-status.json`
- `artifacts/phase_2_data_backed_research_app/source-view.json`
- `artifacts/phase_2_data_backed_research_app/parallax-data-dashboard.html`
- `artifacts/phase_2_data_backed_research_app/phase2-workspace.json`
- `artifacts/phase_2_data_backed_research_app/audits/dos_7202c8777de4.json`
- `artifacts/phase_2_data_backed_research_app/audits/dos_7202c8777de4.md`
- `artifacts/phase_2_data_backed_research_app/imported-audits/library.json`

## Verification

```text
npm test
tests 35
pass 35
fail 0
```

## Phase Decision

Phase 2 is complete for the local licensed-data-pack scope.

The remaining external launch gate is commercial data licensing and any paid vendor API credentials. The code path now supports vendor-shaped manifests and deterministic replay from local licensed data.

The next phase is Phase 3: LLM Council Beta.
