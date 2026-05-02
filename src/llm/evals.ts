import { makeId, stableHash } from "../core/ids.js";
import { buildEvidenceSnapshot } from "../evidence/store.js";
import { runAnalytics } from "../analytics/run.js";
import { reviewProductPolicy } from "../product/policy.js";
import { evaluateClaimPackets } from "../council/provider.js";
import { PERSONAS } from "../council/personas.js";
import { promptRegistrySnapshot } from "./registry.js";
import { addPromptInjectionFixture, runScriptedLLMCouncil, type ScriptedLLMScenario } from "./scripted.js";

const DEFAULT_NOW = "2026-05-01T14:30:00Z";

function casePassed(name: string, expectedPass: boolean, evalReport: any, extra: Record<string, any> = {}) {
  const passed = evalReport.passed === expectedPass;
  return {
    name,
    expected_pass: expectedPass,
    observed_pass: evalReport.passed,
    passed,
    problems: evalReport.problems,
    warnings: evalReport.warnings,
    ...extra
  };
}

async function baseFixture({ now = DEFAULT_NOW, dataDir = "fixtures" } = {}) {
  const snapshot = await buildEvidenceSnapshot({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "LLM council beta eval fixture",
    dataDir,
    now
  });
  const toolOutputs = runAnalytics(snapshot, { now });
  const policyReview = reviewProductPolicy({
    symbol: "NVDA",
    thesis: "LLM council beta eval fixture",
    actionCeiling: "watchlist",
    intendedUse: "research",
    userClass: "self_directed_investor"
  });
  return { snapshot, toolOutputs, policyReview };
}

function evaluateRun(run: any, fixture: any) {
  let report = evaluateClaimPackets({
    provider: run.provider,
    snapshot: fixture.snapshot,
    toolOutputs: fixture.toolOutputs,
    claimPackets: run.claim_packets,
    policyReview: fixture.policyReview,
    expectedPersonas: PERSONAS,
    strictActionCeiling: true,
    contextWarnings: run.context_warnings
  });
  if (run.failure) {
    const problems = [...report.problems, `Provider failure: ${run.failure}.`];
    const { id: _id, ...stableReport } = report;
    const body = { ...stableReport, passed: false, problems };
    report = {
      id: makeId("ceval", { ...body, hash: stableHash(body) }),
      ...body
    };
  }
  return report;
}

export async function runLLMEvalSuite({
  now = DEFAULT_NOW,
  dataDir = "fixtures"
}: {
  now?: string;
  dataDir?: string;
} = {}) {
  const fixture = await baseFixture({ now, dataDir });
  const cases: any[] = [];

  const safeRun = runScriptedLLMCouncil({ ...fixture, scenario: "safe" });
  cases.push(casePassed(
    "safe_scripted_llm_council",
    true,
    evaluateRun(safeRun, fixture),
    { usage: safeRun.usage, context_warnings: safeRun.context_warnings.length }
  ));

  for (const scenario of ["hallucinated_ref", "numeric_fabrication", "hidden_recommendation"] as ScriptedLLMScenario[]) {
    const run = runScriptedLLMCouncil({ ...fixture, scenario });
    cases.push(casePassed(
      scenario,
      false,
      evaluateRun(run, fixture),
      { usage: run.usage, context_warnings: run.context_warnings.length }
    ));
  }

  const injectedFixture = {
    ...fixture,
    snapshot: addPromptInjectionFixture(fixture.snapshot)
  };
  const injectionRun = runScriptedLLMCouncil({ ...injectedFixture, scenario: "prompt_injection_obedience" });
  cases.push(casePassed(
    "prompt_injection_obedience",
    false,
    evaluateRun(injectionRun, injectedFixture),
    { usage: injectionRun.usage, context_warnings: injectionRun.context_warnings.length }
  ));

  const budgetRun = runScriptedLLMCouncil({
    ...fixture,
    scenario: "safe",
    budget: {
      maxContextTokens: 1,
      maxEstimatedCostUsd: 0.000001
    }
  });
  cases.push(casePassed(
    "cost_budget_exceeded",
    false,
    evaluateRun(budgetRun, fixture),
    { usage: budgetRun.usage, context_warnings: budgetRun.context_warnings.length }
  ));

  const body = {
    suite: "phase_3_llm_council_beta",
    created_at: now,
    passed: cases.every((item) => item.passed),
    case_count: cases.length,
    provider_registry: promptRegistrySnapshot().providers,
    prompt_registry: promptRegistrySnapshot().prompts,
    cases
  };

  return {
    id: makeId("llmeval", { ...body, hash: stableHash(body) }),
    ...body
  };
}
