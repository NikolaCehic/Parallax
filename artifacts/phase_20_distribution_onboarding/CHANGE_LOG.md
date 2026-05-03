# Phase 20 Change Log

## Files Added

- `.github/workflows/ci.yml`
- `.github/ISSUE_TEMPLATE/bug_report.yml`
- `.github/ISSUE_TEMPLATE/feature_request.yml`
- `.github/PULL_REQUEST_TEMPLATE.md`
- `LICENSE`
- `ONBOARDING_PLAN.md`
- `CONTRIBUTING.md`
- `SECURITY.md`
- `CODE_OF_CONDUCT.md`
- `CHANGELOG.md`
- `src/config.ts`
- `tests/phase20_distribution_onboarding.test.ts`
- `artifacts/phase_20_distribution_onboarding/PHASE_20_REPORT.md`
- `artifacts/phase_20_distribution_onboarding/SPEC_VALIDATION.md`
- `artifacts/phase_20_distribution_onboarding/CHANGE_LOG.md`

## Files Changed

- `package.json`
- `package-lock.json`
- `README.md`
- `src/analytics/run.ts`
- `src/cli/parallax.ts`
- `src/doctor.ts`
- `src/index.ts`
- `src/render.ts`

## Behavioral Changes

- `parallax init` initializes a CLI workspace.
- `parallax doctor` reports workspace initialization.
- `parallax analyze` uses `.parallax/config.json` defaults when present.
- Python analytics works from a globally installed package because the worker path is package-relative.
- The npm package is now open source and publishable.

## Validation Commands

```bash
npm test
git diff --check
```
