# Phase 17 Workspace Invitations And User Account Onboarding

Generated: 2026-05-03T11:00:00Z

## What Was Implemented

Phase 17 adds a product-ready onboarding foundation for Parallax workspaces. Platform admins can create tenant invitations, invitees can accept without the service API token, and accepted users receive scoped identity sessions that work with tenant API routes. Invitation and session tokens are one-time reveal values; persisted state uses hashes and IDs only.

## Evidence Artifacts

- setup-apply-sequence.json and setup-repair-final.json: repaired local workspace baseline.
- onboarding-status-initial.json/txt and onboarding-status-final.json/txt: onboarding readiness before and after acceptance.
- invite-create-sanitized.json and invite-create-human-redacted.txt: invite creation evidence with token redacted.
- invite-accept-sanitized.json and invite-accept-human-redacted.txt: acceptance/session evidence with token redacted.
- api-onboarding-status.json and api-control-plane-summary.json: hosted API status evidence.
- hosted-console.html and hosted-console-snapshot.json: console onboarding UI evidence.
- cli-onboarding-status.txt/json: CLI smoke output.
- redaction-check.json: raw token checks plus public/status secret-reference checks.
- console-accessibility-check.json: static onboarding UI checks.
- SPEC_VALIDATION.md: validation against the SPEC slice.

## Test Result

Phase 17 targeted suite: node --test dist/tests/phase17_onboarding.test.js -> 2 pass, 0 fail.
Full suite: npm test -> 68 pass, 0 fail.

## Next Phase

Phase 18 should add public invite-link pages, account settings, organization role management, and safer tenant-scoped console views for non-admin users.
