# Parallax Onboarding Plan

This plan defines the minimum bar for Parallax to behave like usable open source CLI software instead of a local development prototype.

## Target User

A new user should be able to install Parallax, initialize a workspace, verify their runtime, optionally configure a live LLM API key, and run a governed thesis analysis without understanding the internal phase history.

## Golden Path

```bash
npm install -g @nikolacehic/parallax
mkdir parallax-workspace
cd parallax-workspace
parallax init
parallax doctor
export OPENAI_API_KEY="sk-..."
parallax doctor --live
parallax analyze --symbol NVDA --thesis "post-earnings continuation with controlled risk" --council-mode llm-live
```

## Acceptance Criteria

- Package manifest is publishable and not marked private.
- Repository has an open source license.
- CLI exposes `parallax init`.
- `parallax init` creates project-local config, audit directory, sample fixtures, environment template, and onboarding notes.
- CLI can run from a directory outside the repository after initialization.
- Python analytics worker resolves from the installed package, not the caller's working directory.
- `parallax doctor` reports Node, Python, workspace config, and live LLM readiness.
- Live LLM setup uses environment variables and never persists raw API keys.
- README documents npm/global install, repo install, init, doctor, deterministic analysis, and live LLM analysis.
- CI runs build, tests, and package dry-run.
- Contributing, security, code of conduct, changelog, issue templates, and PR template exist.
- Tests cover init unit behavior, CLI smoke behavior, e2e initialized workspace analysis, CLI UI output, package metadata, and integration from a non-repo working directory.

## Non-Goals For This Phase

- Publishing to npm.
- Creating a hosted SaaS onboarding flow.
- Adding a real broker connection.
- Adding real market-data vendor networking.
- Replacing the CLI with a web app.

## Phase 20 Validation Result

Phase 20 satisfies this plan when all acceptance criteria above are implemented and the full test suite passes.
