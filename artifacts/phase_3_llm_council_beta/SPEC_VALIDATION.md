# Phase 3 SPEC Validation

Status: Passed  
Date: 2026-05-02

## SPEC Requirements Checked

| SPEC Requirement | Phase 3 Result |
|---|---|
| Personas must produce schema-valid claim packets | `evaluateClaimPackets` validates every LLM claim packet with `assertPersonaClaimPacket`. |
| Personas must run independently | `runScriptedLLMCouncil` builds one context and one packet per persona. |
| Tools must be permissioned and state mutation blocked | Persona registry marks tool permissions as read-only and `can_mutate_state: false`. |
| Dissent must be preserved | LLM claim packets flow through the existing cross-examination and synthesis path. |
| External text must be untrusted data | Evidence-only contexts label external payloads as untrusted and scan for prompt-injection patterns. |
| Prompt-injection fixtures must be part of CI | `tests/phase3_llm_council.test.ts` and `runLLMEvalSuite` include `prompt_injection_obedience`. |
| No LLM-generated numerical claims without tool support | Calculation claims must include deterministic tool-output refs; `numeric_fabrication` fails. |
| Model output must be reconstructable | Context hashes, provider IDs, prompt IDs, usage, claim packets, and audit bundles are persisted. |
| Model failures must downgrade action class | Hidden recommendation and budget-overrun scenarios fail council eval and resolve to `no_trade`/invalidated. |
| No hidden live execution path | Hidden recommendation and order-ticket language fail strict LLM evaluation. |

## Validation Evidence

- Full suite: `npm test` passed 40/40.
- LLM eval: `artifacts/phase_3_llm_council_beta/llm-eval.json`.
- Safe replay: `artifacts/phase_3_llm_council_beta/audits/dos_79f820d9cb70.json` replayed as valid.
- Red-team replay: `artifacts/phase_3_llm_council_beta/redteam-audits/dos_226bc15b94e7.json` replayed as valid.
- Prompt registry: `artifacts/phase_3_llm_council_beta/prompt-registry.json`.

## Conclusion

Phase 3 satisfies the SPEC for the local scripted-provider beta. A real external LLM adapter can now be added behind the same provider contract, but it must pass this eval suite before it can influence action class.
