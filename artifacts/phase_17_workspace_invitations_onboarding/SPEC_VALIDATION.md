# Phase 17 SPEC Validation

Generated: 2026-05-03T11:00:00Z

## Result

Phase 17 satisfies the workspace invitation and user account onboarding slice. A repaired workspace can issue hash-only invitations, accept an invite without the service API token, create an identity principal/session, and let the accepted user access tenant-scoped hosted API routes.

## Checks

- Invitation boundary: invite-create returns the raw invite token once while workspace-invitations.json stores only invite_token_hash.
- Public accept boundary: /api/onboarding/accept accepts a valid invite token without service-token authorization and returns the identity session token once.
- Scope boundary: onboarding status and invite creation remain behind control-plane/identity write scopes.
- Tenant boundary: the accepted identity session can read tenant alpha with x-parallax-tenant and cannot reuse an already accepted invitation.
- Console boundary: hosted console renders Workspace Onboarding, Create invite, Accept invite, and the onboarding API routes.
- Redaction boundary: generated public/status artifacts contain no raw invite token, session token, hosted service token, or raw secret:// reference; the managed config keeps external secret references as references only.

## Exit Statement

I do not know how to improve the Phase 17 workspace invitation and account onboarding workflow within the current local product scope without beginning the next phase: public invite links, organization-level roles, and hosted account settings.
