# Phase 13 Report: External Data Vendor Adapter Boundary

Date: 2026-05-03

## Outcome

Phase 13 is complete for local vendor replay scope.

Parallax now has a production-shaped external market-data vendor boundary without live vendor networking. It registers tenant-scoped vendor adapter contracts, imports licensed vendor-shaped data packs under tenant paths, records provenance hashes, validates freshness/license state, exposes CLI and hosted API workflows, and blocks unsafe explicit analysis `data_dir` escape.

## Implemented

- `src/saas/data_vendor.ts`
  - tenant-scoped data vendor adapter registry
  - market-data provider contract readiness checks
  - symbol allow-list enforcement
  - restricted/unlicensed/unknown license blocking
  - tenant-scoped data pack writer compatible with the evidence pipeline
  - provenance hash and data-status recording
  - no-live-vendor-network and no-raw-secret controls

- `src/saas/server.ts`
  - hosted data-vendor status endpoint
  - tenant-scoped hosted data-vendor import/status route
  - explicit analysis `data_dir` tenant-workspace enforcement

- CLI commands
  - `data-vendor-register`
  - `data-vendor-import`
  - `data-vendor-status`

- Tests
  - direct adapter/import/status/analyze coverage
  - restricted license rejection
  - unapproved symbol rejection
  - hosted API import/status/analyze coverage
  - unsafe `data_dir` rejection
  - full suite now passes 60/60

## Generated Evidence

- `setup-summary.json`
- `data-vendor-register.json`
- `data-vendor-register-human.txt`
- `data-vendor-import.json`
- `data-vendor-import-human.txt`
- `data-vendor-status.json`
- `data-vendor-status-final.json`
- `data-vendor-status-human.txt`
- `direct-analyze-summary.json`
- `api-data-vendor-import.json`
- `api-data-vendor-status.json`
- `api-tenant-data-vendor-status.json`
- `api-analysis-with-vendor-data.json`
- `api-data-dir-escape-denied.json`
- `api-restricted-license-rejected.json`
- `tenant-event-scope-check.json`
- `redaction-check.json`

## Validation

`npm test`

- Tests: 60
- Passed: 60
- Failed: 0

The Phase 13 tests prove that Parallax can:

- register a licensed tenant-scoped market-data adapter;
- import vendor-shaped data into a tenant-scoped data pack;
- preserve provider, license, data-status, and provenance evidence;
- run analysis from the imported tenant data pack;
- block restricted vendor licenses;
- block symbols outside the adapter allow-list;
- serve hosted data-vendor import/status routes;
- keep tenant-filtered data-vendor event views scoped to that tenant;
- reject hosted analysis `data_dir` values outside the tenant workspace;
- avoid raw vendor secrets and live vendor network calls.

## Exit Statement

Within the local vendor replay scope, I do not know a cleaner Phase 13 implementation than making the vendor adapter contract, license gate, provenance hash, tenant data-pack layout, and hosted path guard explicit before connecting a real market-data vendor network API.
