# Phase 19: CLI Live LLM Mode

## Goal

Move Parallax beyond a local replay-only prototype while keeping the product CLI-first.

The target user flow is:

```bash
export OPENAI_API_KEY="sk-..."
npm run doctor
npm run analyze -- --symbol NVDA --thesis "..." --council-mode llm-live
```

## Implemented

- Added `llm-live` council mode.
- Added a Responses-compatible live LLM client with JSON-schema claim packets.
- Added API-key based provider configuration through environment variables and CLI flags.
- Added `doctor` CLI command for runtime and live LLM readiness checks.
- Added fail-closed behavior for missing keys, provider failures, budget failures, malformed packets, hallucinated refs, unsupported calculation claims, hidden recommendation language, prompt injection, and action-ceiling violations.
- Added live provider registry entry.
- Added README instructions for real LLM API-key usage.
- Added e2e tests with a local Responses-compatible mock server.

## User-Facing Commands

```bash
npm run doctor
```

```bash
npm run doctor -- --live
```

```bash
npm run analyze --silent -- \
  --symbol NVDA \
  --horizon swing \
  --thesis "post-earnings continuation with controlled risk" \
  --ceiling watchlist \
  --council-mode llm-live \
  --llm-model gpt-5-mini
```

## Safety Properties

- Raw API keys are never written into the audit bundle.
- Live model output cannot bypass Python analytics.
- Live model output must return schema-valid claim packets.
- Every evidence ref must point to the frozen evidence snapshot or deterministic tool outputs.
- Calculation claims must cite deterministic tool outputs.
- Live model recommendation or execution language fails the council eval.
- Provider failure produces a no-trade dossier instead of silent degradation.

## Verification

```text
npm test
tests 73
pass 73
fail 0
```

Additional smoke:

```text
npm run doctor -- --llm-api-key-env PARALLAX_TEST_MISSING_KEY
Status: needs_attention
Python: ready
API key: missing PARALLAX_TEST_MISSING_KEY
```
