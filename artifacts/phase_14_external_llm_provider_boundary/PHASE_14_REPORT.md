# Phase 14 Report: External LLM Provider Adapter Boundary

Date: 2026-05-03

## Outcome

Phase 14 is complete for local model replay scope.

Parallax now has a production-shaped external LLM provider boundary without live model networking. It registers tenant-scoped model adapter contracts, runs provider-specific eval suites, creates evidence-only replay analysis runs, records token/cost usage, exposes CLI and hosted API workflows, and blocks unsafe explicit analysis `data_dir` escape plus secret-like model payloads.

## Implemented

- `src/llm/external.ts`
  - external-model-shaped replay council
  - provider-specific eval suite
  - evidence-only context and budget tracking
  - adversarial replay scenarios

- `src/saas/llm_provider.ts`
  - tenant-scoped LLM provider adapter registry
  - provider contract readiness checks
  - prompt/persona validation
  - replay analysis run records
  - no-live-model-network and no-raw-secret controls

- `src/saas/server.ts`
  - hosted LLM-provider status endpoint
  - tenant-scoped hosted replay analysis/status route
  - explicit analysis `data_dir` tenant-workspace enforcement

- CLI commands
  - `llm-provider-register`
  - `llm-provider-analyze`
  - `llm-provider-status`

- Tests
  - direct adapter/eval/status/replay analysis coverage
  - tenant-filtered event status coverage
  - secret-like model payload rejection
  - hosted API replay/status coverage
  - unsafe `data_dir` rejection
  - full suite now passes 62/62

## Generated Evidence

- `setup-summary.json`
- `llm-provider-register.json`
- `llm-provider-register-human.txt`
- `llm-provider-run.json`
- `llm-provider-run-human.txt`
- `llm-provider-status.json`
- `llm-provider-status-final.json`
- `llm-provider-status-human.txt`
- `direct-analysis-summary.json`
- `api-llm-provider-analysis.json`
- `api-llm-provider-status.json`
- `api-tenant-llm-provider-status.json`
- `api-data-dir-escape-denied.json`
- `api-secret-payload-rejected.json`
- `tenant-event-scope-check.json`
- `redaction-check.json`

## Validation

`npm test`

- Tests: 62
- Passed: 62
- Failed: 0

The Phase 14 tests prove that Parallax can register a replay-only LLM provider adapter, run a provider-specific eval suite, create evidence-only replay dossiers, preserve budget and context evidence, serve hosted replay analysis/status routes, reject unsafe hosted `data_dir` values, reject secret-like model payloads, and avoid raw model secrets plus live model network calls.

## Exit Statement

Within the local model replay scope, I do not know a cleaner Phase 14 implementation than making the model adapter contract, provider eval suite, evidence-only context, budget gate, tenant status view, and hosted path guard explicit before connecting a real external model API.
