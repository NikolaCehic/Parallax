# Phase 20: Distribution And CLI Onboarding

## Goal

Make Parallax usable as open source CLI software instead of requiring a local development checkout.

## Implemented

- Added `parallax init`.
- Added project-local `.parallax/config.json`.
- Added sample fixture copying during init.
- Added audit directory creation and `.env.example`.
- Added workspace onboarding README and recommended gitignore notes.
- Made `analyze` read project config defaults.
- Made the Python analytics worker resolve from the installed package instead of the caller working directory.
- Added workspace status to `parallax doctor`.
- Converted package metadata to publishable open source metadata.
- Renamed package to `@nikolacehic/parallax` while keeping the `parallax` binary.
- Added Apache-2.0 license.
- Added `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `CHANGELOG.md`.
- Added GitHub CI workflow.
- Added issue templates and pull request template.
- Added `ONBOARDING_PLAN.md` as the phase acceptance checklist.
- Updated README with global install, init, doctor, and live LLM onboarding.

## Tests Added

- Unit test for workspace initialization.
- E2E test for `init -> doctor -> analyze` from outside the repository.
- CLI UI smoke test for init and doctor human output.
- Package metadata test for publish readiness.
- Package dry-run integration test proving runtime files are included and compiled tests are excluded.
- Onboarding/community file presence test.

## Verification

```text
npm test
tests 78
pass 78
fail 0
```

```text
git diff --check
passed
```

## Self-Review Iteration

Initial implementation was not optimal because the Python worker still depended on the caller's working directory. I fixed it to resolve the worker from the installed package.

Second pass found that `parallax init` created config but `analyze` did not consume it. I fixed `analyze` to load `.parallax/config.json` for defaults.

Third pass found that package publication could accidentally include compiled tests if `files` included the full `dist` directory. I narrowed package files to `dist/src` and added a package dry-run test.

## Exit Condition

I dont know any better solution for this nor do I see anything worng with the current one

## Next Phase

Phase 21 should harden the real-world data-provider onboarding path. The CLI can now install and initialize cleanly, but real users still need a non-amateur way to bring market data beyond bundled fixtures without editing files by hand.
