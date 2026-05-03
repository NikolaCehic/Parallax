# Phase 18 Public Invite Links, Account Settings, And Tenant Console

Generated: 2026-05-03T12:00:00Z

## What Was Implemented

Phase 18 turns workspace onboarding into a usable account path. Public invite links can be accepted through /join, accepted users can open a tenant-scoped console shell, account settings can be read and updated through identity sessions, and admins can change tenant roles with active sessions updated immediately.

## Evidence Artifacts

- setup-apply-sequence.json and setup-repair-final.json: repaired local workspace baseline.
- public-join-page.html and public-join-page-snapshot.json: public invite-link shell evidence.
- tenant-console.html and tenant-console-snapshot.json: tenant-scoped console shell evidence.
- invite-create-sanitized.json and invite-accept-sanitized.json: one-time token flow evidence with raw values redacted.
- api-account-me.json, api-account-profile-update.json, api-membership-role-set.json, api-account-final.json: account and role-management evidence.
- api-reviewer-analysis-denied.json: role downgrade scope enforcement evidence.
- cli-account-me.txt/json, cli-account-profile-update.txt, cli-membership-role-set.txt: CLI smoke evidence.
- redaction-check.json: raw token and public/status secret-reference checks.
- console-accessibility-check.json: static public-shell accessibility checks.
- SPEC_VALIDATION.md: validation against the SPEC slice.

## Test Result

Phase 18 targeted suite: node --test dist/tests/phase18_account_console.test.js -> 2 pass, 0 fail.
Full suite: npm test -> 70 pass, 0 fail.

## Next Phase

Phase 19 should add persistent organizations, real SSO/OIDC handoff contracts, and cloud-storage migration planning for tenant/account state.
