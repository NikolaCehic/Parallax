# Phase 11 Report: Hosted Multi-Tenant API And Persistence

Date: 2026-05-02

## Outcome

Phase 11 is complete for local hosted API scope.

Parallax now has a local hosted multi-tenant API that sits on top of the managed SaaS scaffold. It serves health/readiness/control-plane routes, tenant-scoped state/events/library/status/analyze routes, and the hosted console, while preserving the no-live-broker and no-raw-secret boundaries.

## Implemented

- `src/saas/persistence.ts`
  - tenant slug normalization
  - tenant path isolation checks
  - tenant state persistence
  - tenant event JSONL persistence
  - secret-like payload rejection
  - tenant persistence readiness summary

- `src/saas/server.ts`
  - hosted API token hashing and verification
  - health and readiness endpoints
  - authenticated control-plane endpoint
  - tenant-scoped state, event, library, status, and analyze endpoints
  - hosted console serving
  - cross-tenant header enforcement

- CLI commands
  - `hosted-api-status`
  - `tenant-persistence`
  - `tenant-state-set`
  - `hosted-serve`

- Tests
  - direct hosted API E2E test
  - tenant persistence helper test
  - CLI smoke test
  - full suite now passes 56/56

## Generated Evidence

- `setup-summary.json`
- `hosted-api-status.json`
- `hosted-api-status-human.txt`
- `tenant-persistence-before.json`
- `tenant-persistence-after.json`
- `tenant-persistence-human.txt`
- `api-health.json`
- `api-ready.json`
- `api-unauthorized.json`
- `api-control-plane.json`
- `tenant-alpha-state-write.json`
- `tenant-alpha-state.json`
- `tenant-cross-tenant-denied.json`
- `tenant-secret-payload-rejected.json`
- `tenant-alpha-analyze.json`
- `tenant-alpha-library.json`
- `tenant-beta-library.json`
- `tenant-alpha-events.json`
- `hosted-console.html`
- `hosted-console-redaction-check.json`

## Validation

`npm test`

- Tests: 56
- Passed: 56
- Failed: 0

The Phase 11 tests prove that Parallax can:

- report hosted API readiness from provider validation and tenant persistence;
- require bearer auth for control-plane routes;
- require matching tenant headers for tenant-scoped routes;
- write tenant state without leaking across tenants;
- reject secret-like tenant payloads;
- create tenant-scoped dossiers through HTTP;
- keep tenant libraries isolated;
- serve the hosted console without raw secret references;
- keep direct live broker connection disabled.

## Exit Statement

Within the local hosted API scope, I do not know a cleaner Phase 11 implementation than adding tenant-scoped persistence and authenticated hosted routes on top of the managed SaaS scaffold before connecting cloud identity, storage, external data vendors, model providers, or regulated production execution.
