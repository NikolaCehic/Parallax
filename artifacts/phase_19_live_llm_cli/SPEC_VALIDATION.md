# Phase 19 SPEC Validation

## Criterion: CLI-first product

Passed.

Parallax remains primarily operated through the CLI. The new live LLM path is exposed through `analyze --council-mode llm-live`, and setup is exposed through `doctor`.

## Criterion: Real API-key based LLM usage

Passed.

The live provider reads `OPENAI_API_KEY` by default, supports `PARALLAX_LLM_API_KEY`, and can be pointed to another Responses-compatible base URL with `--llm-base-url`.

## Criterion: Not replay-only

Passed.

`llm-live` performs direct model network calls when an API key is configured. The existing scripted and replay providers remain for deterministic tests and safety evals.

## Criterion: Safety gates remain stronger than model output

Passed.

Live model packets are evaluated by the same council eval and decision gate as deterministic and scripted packets. Invalid outputs fail closed.

## Criterion: E2E proof

Passed.

The Phase 19 e2e suite runs the CLI against a local Responses-compatible server and verifies:

- bearer token header is sent;
- requested model is sent;
- one request is made per council persona;
- a governed dossier is produced;
- missing API key fails closed.
