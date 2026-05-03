import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertDecisionPacket, assertEvidenceSnapshot, assertThesisLifecycle, assertTradeThesisDossier } from "../core/schemas.js";
import { isoNow, makeId, stableHash } from "../core/ids.js";
import { buildEvidenceSnapshot } from "../evidence/store.js";
import { runAnalytics } from "../analytics/run.js";
import { crossExamine, synthesizeDossierSummary } from "../council/runner.js";
import { evaluateClaimPackets } from "../council/provider.js";
import { applyDecisionGate } from "../decision/gate.js";
import { assignLifecycle } from "../lifecycle/engine.js";
import { writeAuditBundle } from "../audit.js";
import { reviewProductPolicy } from "../product/policy.js";
import { PERSONAS } from "../council/personas.js";
import { promptRegistrySnapshot } from "../llm/registry.js";
import {
  llmProviderToCouncilProvider,
  runExternalLLMProviderEvalSuite,
  runExternalLLMReplayCouncil
} from "../llm/external.js";
import { providerValidationPath, validateProviderContracts } from "../providers/validation.js";
import { loadManagedSaasConfig, managedSaasConfigPath } from "./managed.js";
import { normalizeTenantSlug, resolveTenant } from "./persistence.js";

export const LLM_PROVIDER_FILE = "llm-provider-adapters.json";
export const LLM_PROVIDER_EVENTS_FILE = "llm-provider-events.jsonl";

async function readRegistryJson(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function readTextIfExists(filePath: string) {
  try {
    return await readFile(filePath, "utf8");
  } catch (error: any) {
    if (error.code === "ENOENT") return "";
    throw error;
  }
}

async function writeJson(filePath: string, value: any) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonLines(text = "") {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function registryPath(rootDir = "managed-saas") {
  return path.join(rootDir, LLM_PROVIDER_FILE);
}

function eventsPath(rootDir = "managed-saas") {
  return path.join(rootDir, LLM_PROVIDER_EVENTS_FILE);
}

function normalizeAdapterId(adapterId: string) {
  const normalized = String(adapterId ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_.-]{1,80}$/.test(normalized)) {
    throw new Error("LLM provider adapter id must be 2-81 chars and contain only lowercase letters, numbers, dot, hyphen, or underscore.");
  }
  if (normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error("LLM provider adapter id cannot contain path traversal characters.");
  }
  return normalized;
}

function normalizeSymbol(symbol: string) {
  const normalized = String(symbol ?? "").trim().toUpperCase();
  if (!/^[A-Z0-9._-]{1,16}$/.test(normalized)) {
    throw new Error("LLM provider symbol must be 1-16 uppercase letters, numbers, dot, hyphen, or underscore.");
  }
  return normalized;
}

function assertInsideRoot(rootDir: string, candidate: string) {
  const root = path.resolve(rootDir);
  const target = path.resolve(candidate);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Resolved LLM provider path escapes managed SaaS root: ${candidate}`);
  }
}

function assertNoSensitivePayload(value: any) {
  const serialized = JSON.stringify(value).toLowerCase();
  for (const forbidden of ["raw_secret", "secret_value", "api_key_value", "access_token", "private_key", "password", "secret://"]) {
    if (serialized.includes(forbidden)) {
      throw new Error(`Sensitive LLM provider payload field is not allowed: ${forbidden}`);
    }
  }
}

function assertPromptIds(promptIds: string[]) {
  const prompts = promptRegistrySnapshot().prompts as Record<string, any>;
  for (const promptId of promptIds) {
    if (!prompts[promptId]) throw new Error(`Unknown LLM prompt id ${promptId}.`);
  }
  return promptIds;
}

function assertPersonas(personas: string[]) {
  for (const persona of personas) {
    if (!PERSONAS.includes(persona)) throw new Error(`Unknown LLM persona ${persona}.`);
  }
  return personas;
}

function defaultRegistry(rootDir = "managed-saas", now = isoNow()) {
  return {
    schema_version: "0.1.0",
    root_dir: rootDir,
    created_at: now,
    boundary: {
      mode: "local_llm_replay_contract",
      direct_model_network_connection: false,
      raw_model_secret_storage_allowed: false,
      evidence_only_context_required: true,
      claim_packet_eval_required: true,
      prompt_registry_required: true,
      budget_gate_required: true
    },
    adapters: [],
    runs: []
  };
}

async function loadRegistry(rootDir = "managed-saas") {
  const registry = await readRegistryJson(registryPath(rootDir), defaultRegistry(rootDir));
  return {
    ...defaultRegistry(rootDir),
    ...registry,
    root_dir: rootDir,
    adapters: registry.adapters ?? [],
    runs: registry.runs ?? []
  };
}

async function saveRegistry(rootDir: string, registry: any) {
  const next = {
    ...registry,
    schema_version: "0.1.0",
    root_dir: rootDir,
    updated_at: isoNow()
  };
  await writeJson(registryPath(rootDir), next);
  return next;
}

async function appendLLMProviderEvent({
  rootDir = "managed-saas",
  eventType,
  actor = "llm_provider_boundary",
  payload = {},
  now = isoNow()
}: {
  rootDir?: string;
  eventType: string;
  actor?: string;
  payload?: Record<string, any>;
  now?: string;
}) {
  assertNoSensitivePayload(payload);
  const event = {
    id: makeId("llm_provider_evt", { rootDir, eventType, actor, payload, now }),
    event_type: eventType,
    actor,
    payload,
    created_at: now
  };
  await mkdir(rootDir, { recursive: true });
  await appendFile(eventsPath(rootDir), `${JSON.stringify(event)}\n`);
  return event;
}

function adapterProvider(adapter: any) {
  return llmProviderToCouncilProvider(adapter);
}

async function assertLLMProviderContractReady({
  rootDir,
  configPath,
  now
}: {
  rootDir: string;
  configPath: string;
  now: string;
}) {
  const providerValidation = await validateProviderContracts({
    rootDir,
    configPath,
    out: providerValidationPath(rootDir),
    now
  });
  const ready = providerValidation.providers.some((provider: any) =>
    provider.kind === "llm_provider" && provider.status === "contract_validated"
  );
  if (!ready) throw new Error("LLM provider contract validation must pass before adapter use.");
  return providerValidation;
}

export async function registerLLMProviderAdapter({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  adapterId,
  name,
  provider,
  tenantSlug,
  secretRef,
  endpoint = "",
  modelRegistryRef,
  promptIds = ["claim_packet_v0", "critique_packet_v0"],
  allowedPersonas = PERSONAS,
  maxContextTokens = 50000,
  maxEstimatedCostUsd = 0.2,
  costPer1kContextTokensUsd = 0.0005,
  evalDataDir = "fixtures",
  actor = "platform",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  adapterId: string;
  name: string;
  provider: string;
  tenantSlug: string;
  secretRef: string;
  endpoint?: string;
  modelRegistryRef?: string;
  promptIds?: string[];
  allowedPersonas?: string[];
  maxContextTokens?: number;
  maxEstimatedCostUsd?: number;
  costPer1kContextTokensUsd?: number;
  evalDataDir?: string;
  actor?: string;
  now?: string;
}) {
  const adapter_id = normalizeAdapterId(adapterId);
  const tenant_slug = normalizeTenantSlug(tenantSlug);
  const normalizedPromptIds = assertPromptIds(promptIds.map((item) => String(item).trim()).filter(Boolean));
  const normalizedPersonas = assertPersonas(allowedPersonas.map((item) => String(item).trim()).filter(Boolean));
  if (!normalizedPromptIds.length) throw new Error("At least one LLM prompt id is required.");
  if (!normalizedPersonas.length) throw new Error("At least one LLM persona is required.");
  if (maxContextTokens <= 0 || maxEstimatedCostUsd <= 0 || costPer1kContextTokensUsd < 0) {
    throw new Error("LLM provider budget limits must be positive and explicit.");
  }
  const config = await loadManagedSaasConfig({ rootDir, configPath });
  if (!config.tenants.some((tenant: any) => tenant.slug === tenant_slug)) {
    throw new Error(`Unknown tenant ${tenant_slug}.`);
  }
  if (!config.secret_refs.some((secret: any) => secret.name === secretRef || secret.secret_ref === secretRef)) {
    throw new Error(`Unknown secret reference ${secretRef}.`);
  }
  assertNoSensitivePayload({
    adapterId,
    name,
    provider,
    tenantSlug,
    secretRef,
    endpoint,
    modelRegistryRef,
    promptIds,
    allowedPersonas
  });
  await assertLLMProviderContractReady({ rootDir, configPath, now });
  const adapter = {
    id: makeId("llm_provider_adapter", { adapter_id, tenant_slug, provider, secretRef }),
    adapter_id,
    name,
    provider,
    tenant_slug,
    secret_ref_name: secretRef,
    endpoint,
    model_registry_ref: modelRegistryRef ?? `${provider}_replay_model`,
    version: "0.1.0",
    prompt_ids: normalizedPromptIds,
    allowed_personas: normalizedPersonas,
    max_context_tokens: maxContextTokens,
    max_estimated_cost_usd: maxEstimatedCostUsd,
    cost_per_1k_context_tokens_usd: costPer1kContextTokensUsd,
    mode: "local_llm_replay_contract",
    direct_model_network_connection: false,
    raw_secret_stored: false,
    created_at: now
  };
  const evalSuite = await runExternalLLMProviderEvalSuite({
    provider: adapterProvider(adapter),
    dataDir: evalDataDir,
    personas: normalizedPersonas,
    now
  });
  if (!evalSuite.passed) {
    throw new Error("LLM provider adapter eval suite failed.");
  }
  const savedAdapter = {
    ...adapter,
    eval_suite: {
      id: evalSuite.id,
      suite: evalSuite.suite,
      passed: evalSuite.passed,
      case_count: evalSuite.case_count,
      prompt_registry_hash: stableHash(evalSuite.prompt_registry),
      created_at: evalSuite.created_at
    }
  };
  const registry = await loadRegistry(rootDir);
  const saved = await saveRegistry(rootDir, {
    ...registry,
    adapters: [
      ...registry.adapters.filter((item: any) => !(item.adapter_id === adapter_id && item.tenant_slug === tenant_slug)),
      savedAdapter
    ]
  });
  await appendLLMProviderEvent({
    rootDir,
    eventType: "llm_provider_adapter_registered",
    actor,
    payload: {
      adapter_id,
      tenant_slug,
      provider,
      model_registry_ref: savedAdapter.model_registry_ref,
      eval_suite_passed: true
    },
    now
  });
  return {
    adapter: savedAdapter,
    eval_suite: evalSuite,
    adapter_count: saved.adapters.length,
    registry_path: registryPath(rootDir)
  };
}

export async function runLLMProviderReplayAnalysis({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  adapterId,
  tenantSlug,
  symbol,
  horizon = "swing",
  thesis,
  dataDir = "fixtures",
  actionCeiling = "watchlist",
  userClass = "research_team",
  intendedUse = "team_review",
  scenario = "safe",
  llmBudget,
  audit = false,
  auditDir,
  actor = "llm_provider_replay",
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  adapterId: string;
  tenantSlug: string;
  symbol: string;
  horizon?: string;
  thesis: string;
  dataDir?: string;
  actionCeiling?: string;
  userClass?: string;
  intendedUse?: string;
  scenario?: any;
  llmBudget?: {
    maxContextTokens?: number;
    maxEstimatedCostUsd?: number;
  };
  audit?: boolean;
  auditDir?: string;
  actor?: string;
  now?: string;
}) {
  const adapter_id = normalizeAdapterId(adapterId);
  const tenant_slug = normalizeTenantSlug(tenantSlug);
  const normalizedSymbol = normalizeSymbol(symbol);
  assertNoSensitivePayload({ thesis, scenario, llmBudget });
  await assertLLMProviderContractReady({ rootDir, configPath, now });
  const registry = await loadRegistry(rootDir);
  const adapter = registry.adapters.find((item: any) => item.adapter_id === adapter_id && item.tenant_slug === tenant_slug);
  if (!adapter) throw new Error(`Unknown LLM provider adapter ${adapter_id} for tenant ${tenant_slug}.`);
  if (adapter.eval_suite?.passed !== true) throw new Error(`LLM provider adapter ${adapter_id} has not passed its eval suite.`);
  const tenant = await resolveTenant({ rootDir, configPath, tenantSlug: tenant_slug });
  const resolvedAuditDir = auditDir ?? tenant.audit_dir;
  if (audit) assertInsideRoot(rootDir, resolvedAuditDir);

  const policyReview = reviewProductPolicy({
    symbol: normalizedSymbol,
    thesis,
    actionCeiling,
    userClass,
    intendedUse
  });
  const snapshot = await buildEvidenceSnapshot({
    symbol: normalizedSymbol,
    horizon,
    thesis,
    dataDir,
    now
  });
  assertEvidenceSnapshot(snapshot);
  const toolOutputs = runAnalytics(snapshot, { now });
  const provider = adapterProvider(adapter);
  const llmRun = runExternalLLMReplayCouncil({
    snapshot,
    toolOutputs,
    personas: adapter.allowed_personas,
    policyReview,
    scenario,
    provider,
    budget: llmBudget
  });
  let evalReport = evaluateClaimPackets({
    provider: llmRun.provider,
    snapshot,
    toolOutputs,
    claimPackets: llmRun.claim_packets,
    policyReview,
    expectedPersonas: adapter.allowed_personas,
    strictActionCeiling: true,
    contextWarnings: llmRun.context_warnings
  });
  if (llmRun.failure) {
    const { id: _id, ...stableReport } = evalReport;
    const body = {
      ...stableReport,
      passed: false,
      problems: [...evalReport.problems, `Provider failure: ${llmRun.failure}.`]
    };
    evalReport = {
      id: makeId("ceval", { ...body, hash: stableHash(body) }),
      ...body
    };
  }

  const claimPackets = llmRun.claim_packets;
  const crossExamination = crossExamine(claimPackets);
  const summary = synthesizeDossierSummary({ claimPackets, crossExamination });
  const dossierId = makeId("dos", { symbol: normalizedSymbol, horizon, thesis, snapshot: snapshot.hash, now, provider: adapter_id });
  const auditBundleRef = audit ? path.join(resolvedAuditDir, `${dossierId}.json`) : "pending";
  const decisionPacket = applyDecisionGate({
    dossierId,
    claimPackets,
    toolOutputs,
    summary,
    policyReview,
    councilEval: evalReport,
    actionCeiling: policyReview.effective_action_ceiling,
    auditBundleRef
  });
  const lifecycle = assignLifecycle({ dossierId, snapshot, toolOutputs, decisionPacket, now });
  decisionPacket.thesis_state = lifecycle.state;
  decisionPacket.freshness_score = lifecycle.freshness_score;
  assertDecisionPacket(decisionPacket);
  assertThesisLifecycle(lifecycle);

  const dossier = {
    id: dossierId,
    created_at: now,
    title: `${normalizedSymbol} ${horizon} thesis dossier`,
    symbol: normalizedSymbol,
    horizon,
    thesis,
    action_class: decisionPacket.action_class,
    evidence_snapshot: snapshot,
    policy_review: policyReview,
    tool_outputs: toolOutputs,
    council_run: {
      provider: llmRun.provider,
      eval_report: evalReport,
      contexts: llmRun.contexts ?? [],
      usage: llmRun.usage ?? null
    },
    claim_packets: claimPackets,
    cross_examination: crossExamination,
    summary,
    decision_packet: decisionPacket,
    lifecycle
  };
  assertTradeThesisDossier(dossier);
  if (audit) await writeAuditBundle(dossier, { auditDir: resolvedAuditDir });

  const runRecord = {
    id: makeId("llm_provider_run", {
      adapter_id,
      tenant_slug,
      dossier_id: dossier.id,
      snapshot_hash: snapshot.hash,
      eval_id: evalReport.id,
      now
    }),
    adapter_id,
    tenant_slug,
    dossier_id: dossier.id,
    symbol: normalizedSymbol,
    horizon,
    scenario,
    model_registry_ref: provider.model_registry_ref,
    prompt_ids: provider.prompt_ids,
    context_hashes: (llmRun.contexts ?? []).map((context: any) => context.hash),
    evidence_snapshot_hash: snapshot.hash,
    council_eval_id: evalReport.id,
    council_eval_passed: evalReport.passed,
    council_eval_problem_count: evalReport.problems.length,
    action_class: dossier.decision_packet.action_class,
    usage: llmRun.usage,
    direct_model_network_connection: false,
    raw_secret_stored: false,
    audit_path: audit ? auditBundleRef : "",
    created_at: now,
    created_by: actor
  };
  const saved = await saveRegistry(rootDir, {
    ...registry,
    runs: [
      ...registry.runs.filter((item: any) => item.id !== runRecord.id),
      runRecord
    ]
  });
  await appendLLMProviderEvent({
    rootDir,
    eventType: "llm_provider_replay_analysis_created",
    actor,
    payload: {
      run_id: runRecord.id,
      adapter_id,
      tenant_slug,
      dossier_id: dossier.id,
      symbol: normalizedSymbol,
      council_eval_passed: evalReport.passed,
      action_class: dossier.decision_packet.action_class
    },
    now
  });
  return {
    run: runRecord,
    dossier,
    run_count: saved.runs.length,
    registry_path: registryPath(rootDir)
  };
}

export async function llmProviderStatus({
  rootDir = "managed-saas",
  configPath = managedSaasConfigPath(rootDir),
  tenantSlug,
  now = isoNow()
}: {
  rootDir?: string;
  configPath?: string;
  tenantSlug?: string;
  now?: string;
} = {}) {
  const registry = await loadRegistry(rootDir);
  const normalizedTenant = tenantSlug ? normalizeTenantSlug(tenantSlug) : "";
  const adapters = normalizedTenant
    ? registry.adapters.filter((adapter: any) => adapter.tenant_slug === normalizedTenant)
    : registry.adapters;
  const runs = normalizedTenant
    ? registry.runs.filter((run: any) => run.tenant_slug === normalizedTenant)
    : registry.runs;
  const providerValidation = await validateProviderContracts({
    rootDir,
    configPath,
    out: providerValidationPath(rootDir),
    now
  });
  const llmProviderReady = providerValidation.providers.some((provider: any) =>
    provider.kind === "llm_provider" && provider.status === "contract_validated"
  );
  const prompts = promptRegistrySnapshot().prompts as Record<string, any>;
  const promptIdsKnown = adapters.every((adapter: any) =>
    adapter.prompt_ids?.length > 0 && adapter.prompt_ids.every((promptId: string) => Boolean(prompts[promptId]))
  );
  const budgetsExplicit = adapters.every((adapter: any) =>
    adapter.max_context_tokens > 0 &&
    adapter.max_estimated_cost_usd > 0 &&
    adapter.cost_per_1k_context_tokens_usd >= 0
  );
  const controls = [
    {
      id: "llm_provider_contract_ready",
      passed: llmProviderReady,
      severity: "required",
      detail: "Managed LLM provider contract is validated."
    },
    {
      id: "adapter_registered",
      passed: adapters.length > 0,
      severity: "required",
      detail: "At least one tenant-scoped LLM provider adapter is registered."
    },
    {
      id: "prompt_contract_known",
      passed: adapters.length > 0 && promptIdsKnown,
      severity: "required",
      detail: "Adapter prompt ids are present in the prompt registry."
    },
    {
      id: "provider_eval_suite_passed",
      passed: adapters.length > 0 && adapters.every((adapter: any) => adapter.eval_suite?.passed === true),
      severity: "required",
      detail: "Each adapter passed the external LLM replay eval suite."
    },
    {
      id: "replay_run_recorded",
      passed: runs.length > 0,
      severity: "required",
      detail: "At least one tenant-scoped replay analysis run has been recorded."
    },
    {
      id: "replay_eval_passed",
      passed: runs.length > 0 && runs.every((run: any) => run.council_eval_passed === true),
      severity: "required",
      detail: "Recorded replay runs passed claim-packet evaluation."
    },
    {
      id: "budget_limits_explicit",
      passed: adapters.length > 0 && budgetsExplicit && runs.every((run: any) => run.usage?.budget_exceeded === false),
      severity: "required",
      detail: "Adapters declare token/cost budgets and replay runs stay within them."
    },
    {
      id: "no_order_ticket_escalation",
      passed: runs.every((run: any) => run.action_class !== "order_ticket_candidate"),
      severity: "required",
      detail: "External LLM replay cannot create an order-ticket candidate in the general product boundary."
    },
    {
      id: "no_raw_model_secrets",
      passed: adapters.every((adapter: any) => adapter.raw_secret_stored === false) &&
        runs.every((run: any) => run.raw_secret_stored === false),
      severity: "required",
      detail: "LLM provider registry stores secret reference names and hashes only."
    },
    {
      id: "direct_model_network_disabled",
      passed: adapters.every((adapter: any) => adapter.direct_model_network_connection === false) &&
        runs.every((run: any) => run.direct_model_network_connection === false),
      severity: "required",
      detail: "Phase 14 uses local replay contracts, not live model networking."
    }
  ];
  const requiredFailures = controls.filter((control) => control.severity === "required" && !control.passed);
  const allEvents = parseJsonLines(await readTextIfExists(eventsPath(rootDir)));
  const events = normalizedTenant
    ? allEvents.filter((event: any) => event.payload?.tenant_slug === normalizedTenant)
    : allEvents;
  return {
    schema_version: "0.1.0",
    generated_at: now,
    root_dir: rootDir,
    config_path: configPath,
    registry_path: registryPath(rootDir),
    events_path: eventsPath(rootDir),
    status: requiredFailures.length === 0 ? "ready_for_external_llm_provider_boundary" : "blocked",
    summary: {
      adapter_count: adapters.length,
      run_count: runs.length,
      event_count: events.length,
      required_failure_count: requiredFailures.length,
      failed_replay_run_count: runs.filter((run: any) => run.council_eval_passed !== true).length,
      raw_secret_stored: false,
      direct_model_network_connection: false
    },
    controls,
    adapters,
    runs,
    latest_events: events.slice(-8).reverse(),
    provider_validation: providerValidation
  };
}
