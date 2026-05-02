import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { makeId, isoNow } from "../core/ids.js";
import { assertThesisTrigger } from "../core/schemas.js";
import { readAuditBundle } from "../audit.js";
import { createLifecycleTrigger } from "./engine.js";

export const ALERT_PREFERENCES_FILE = "alert-preferences.json";
export const LIFECYCLE_OVERRIDES_FILE = "lifecycle-overrides.json";
export const LIFECYCLE_CHECKS_FILE = "lifecycle-checks.json";
export const NOTIFICATIONS_FILE = "notifications.jsonl";

export const DEFAULT_ALERT_PREFERENCES = {
  schema_version: "0.1.0",
  channels: ["local_inbox"],
  quiet_unchanged: true,
  notify_on_states: ["stale", "invalidated", "upgraded"],
  notify_on_trigger_kinds: ["recheck", "downgrade", "invalidate", "escalate"],
  muted_symbols: [],
  min_freshness_score: 0.35
};

async function readJsonIfExists(filePath: string, fallback: any) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return fallback;
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

function uniqueStrings(values: any[]) {
  return [...new Set(values.map((value) => String(value).trim()).filter(Boolean))];
}

export async function readAlertPreferences(auditDir = "audits") {
  const saved = await readJsonIfExists(path.join(auditDir, ALERT_PREFERENCES_FILE), {});
  return {
    ...DEFAULT_ALERT_PREFERENCES,
    ...saved,
    audit_dir: auditDir,
    channels: uniqueStrings(saved.channels ?? DEFAULT_ALERT_PREFERENCES.channels),
    notify_on_states: uniqueStrings(saved.notify_on_states ?? DEFAULT_ALERT_PREFERENCES.notify_on_states),
    notify_on_trigger_kinds: uniqueStrings(saved.notify_on_trigger_kinds ?? DEFAULT_ALERT_PREFERENCES.notify_on_trigger_kinds),
    muted_symbols: uniqueStrings(saved.muted_symbols ?? DEFAULT_ALERT_PREFERENCES.muted_symbols)
  };
}

export async function updateAlertPreferences({
  auditDir = "audits",
  channels,
  quietUnchanged,
  notifyOnStates,
  notifyOnTriggerKinds,
  minFreshnessScore,
  mute = [],
  unmute = []
}: {
  auditDir?: string;
  channels?: string[];
  quietUnchanged?: boolean;
  notifyOnStates?: string[];
  notifyOnTriggerKinds?: string[];
  minFreshnessScore?: number;
  mute?: string[];
  unmute?: string[];
}) {
  const current = await readAlertPreferences(auditDir);
  let muted = new Set(current.muted_symbols);
  for (const symbol of mute) muted.add(symbol.toUpperCase());
  for (const symbol of unmute) muted.delete(symbol.toUpperCase());

  const next = {
    ...current,
    schema_version: "0.1.0",
    audit_dir: auditDir,
    channels: channels ? uniqueStrings(channels) : current.channels,
    quiet_unchanged: quietUnchanged ?? current.quiet_unchanged,
    notify_on_states: notifyOnStates ? uniqueStrings(notifyOnStates) : current.notify_on_states,
    notify_on_trigger_kinds: notifyOnTriggerKinds ? uniqueStrings(notifyOnTriggerKinds) : current.notify_on_trigger_kinds,
    muted_symbols: [...muted].sort(),
    min_freshness_score: minFreshnessScore ?? current.min_freshness_score,
    updated_at: isoNow()
  };
  await writeJson(path.join(auditDir, ALERT_PREFERENCES_FILE), next);
  return next;
}

export async function readLifecycleOverrides(auditDir = "audits") {
  const saved = await readJsonIfExists(path.join(auditDir, LIFECYCLE_OVERRIDES_FILE), {});
  return {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    overrides: saved.overrides ?? {}
  };
}

export function applyLifecycleOverrides(lifecycle: any, override: any = {}) {
  const disabled = new Set(override.disabled_trigger_ids ?? []);
  const baseTriggers = (lifecycle.triggers ?? []).filter((trigger: any) => !disabled.has(trigger.id));
  const customTriggers = override.custom_triggers ?? [];
  return {
    ...lifecycle,
    triggers: [...baseTriggers, ...customTriggers]
  };
}

export async function addLifecycleTrigger({
  auditPath,
  auditDir = path.dirname(auditPath),
  kind,
  conditionType,
  condition,
  rationale,
  linkedAssumption = "",
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  kind: string;
  conditionType: string;
  condition: string;
  rationale: string;
  linkedAssumption?: string;
  now?: string;
}) {
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const trigger = {
    ...createLifecycleTrigger({ kind, conditionType, condition, rationale, linkedAssumption }),
    source: "user_override",
    created_at: now
  };
  assertThesisTrigger(trigger);

  const file = await readLifecycleOverrides(auditDir);
  const previous = file.overrides[dossier.id] ?? {};
  const existingTriggers = previous.custom_triggers ?? [];
  const nextOverride = {
    dossier_id: dossier.id,
    audit_path: auditPath,
    updated_at: now,
    custom_triggers: [...existingTriggers.filter((item: any) => item.id !== trigger.id), trigger],
    disabled_trigger_ids: previous.disabled_trigger_ids ?? []
  };
  const next = {
    ...file,
    overrides: {
      ...file.overrides,
      [dossier.id]: nextOverride
    }
  };
  await writeJson(path.join(auditDir, LIFECYCLE_OVERRIDES_FILE), next);
  return {
    audit_dir: auditDir,
    dossier_id: dossier.id,
    trigger,
    override: nextOverride,
    override_path: path.join(auditDir, LIFECYCLE_OVERRIDES_FILE)
  };
}

export async function disableLifecycleTrigger({
  auditPath,
  auditDir = path.dirname(auditPath),
  triggerId,
  now = isoNow()
}: {
  auditPath: string;
  auditDir?: string;
  triggerId: string;
  now?: string;
}) {
  const bundle = await readAuditBundle(auditPath);
  const dossier = bundle.dossier;
  const file = await readLifecycleOverrides(auditDir);
  const previous = file.overrides[dossier.id] ?? {};
  const disabled = new Set(previous.disabled_trigger_ids ?? []);
  disabled.add(triggerId);
  const nextOverride = {
    dossier_id: dossier.id,
    audit_path: auditPath,
    updated_at: now,
    custom_triggers: previous.custom_triggers ?? [],
    disabled_trigger_ids: [...disabled].sort()
  };
  const next = {
    ...file,
    overrides: {
      ...file.overrides,
      [dossier.id]: nextOverride
    }
  };
  await writeJson(path.join(auditDir, LIFECYCLE_OVERRIDES_FILE), next);
  return {
    audit_dir: auditDir,
    dossier_id: dossier.id,
    disabled_trigger_id: triggerId,
    override: nextOverride,
    override_path: path.join(auditDir, LIFECYCLE_OVERRIDES_FILE)
  };
}

export async function readLifecycleChecks(auditDir = "audits") {
  const saved = await readJsonIfExists(path.join(auditDir, LIFECYCLE_CHECKS_FILE), {});
  return {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    checks: saved.checks ?? {}
  };
}

export async function writeLifecycleChecks(auditDir: string, checks: Record<string, any>) {
  const body = {
    schema_version: "0.1.0",
    audit_dir: auditDir,
    updated_at: isoNow(),
    checks
  };
  await writeJson(path.join(auditDir, LIFECYCLE_CHECKS_FILE), body);
  return body;
}

export function buildLifecycleCheck(entry: any) {
  return {
    dossier_id: entry.dossier_id,
    symbol: entry.symbol,
    checked_at: entry.checked_at,
    current_state: entry.current_state,
    freshness_score: entry.freshness_score,
    checked_price: entry.checked_price,
    fired_trigger_ids: (entry.fired_triggers ?? []).map((trigger: any) => trigger.id),
    fired_trigger_kinds: (entry.fired_triggers ?? []).map((trigger: any) => trigger.kind),
    status: entry.status
  };
}

export function diffLifecycleCheck(previous: any, current: any) {
  if (!previous) {
    return {
      status: "first_check",
      changed_fields: ["current_state", "freshness_score", "checked_price", "fired_trigger_ids"],
      previous_check: null
    };
  }

  const changedFields = [];
  if (previous.current_state !== current.current_state) changedFields.push("current_state");
  if (previous.freshness_score !== current.freshness_score) changedFields.push("freshness_score");
  if (previous.checked_price !== current.checked_price) changedFields.push("checked_price");
  if (JSON.stringify(previous.fired_trigger_ids ?? []) !== JSON.stringify(current.fired_trigger_ids ?? [])) {
    changedFields.push("fired_trigger_ids");
  }

  return {
    status: changedFields.length ? "changed" : "unchanged",
    changed_fields: changedFields,
    previous_check: previous
  };
}

function shouldNotify(entry: any, preferences: any) {
  if (!preferences.channels.includes("local_inbox")) return false;
  if (preferences.muted_symbols.includes(entry.symbol)) return false;
  if (entry.change_since_last_run?.status === "unchanged" && preferences.quiet_unchanged) return false;
  const firedKinds = (entry.fired_triggers ?? []).map((trigger: any) => trigger.kind);
  const matchingTrigger = firedKinds.some((kind: string) => preferences.notify_on_trigger_kinds.includes(kind));
  const matchingState = preferences.notify_on_states.includes(entry.current_state);
  const lowFreshness = entry.freshness_score <= preferences.min_freshness_score;
  return entry.status === "attention" && (matchingTrigger || matchingState || lowFreshness);
}

export function notificationFromEntry(entry: any, now = isoNow()) {
  const body = {
    dossier_id: entry.dossier_id,
    symbol: entry.symbol,
    created_at: now,
    severity: entry.current_state === "invalidated" ? "critical" : entry.current_state === "upgraded" ? "opportunity" : "attention",
    title: `${entry.symbol} thesis ${entry.current_state}`,
    message: `${entry.symbol} moved from ${entry.previous_state} to ${entry.current_state} with ${(entry.fired_triggers ?? []).length} fired trigger(s).`,
    current_state: entry.current_state,
    previous_state: entry.previous_state,
    fired_trigger_ids: (entry.fired_triggers ?? []).map((trigger: any) => trigger.id),
    audit_path: entry.audit_path
  };
  return {
    id: makeId("note", body),
    ...body
  };
}

export async function appendLifecycleNotifications({
  auditDir = "audits",
  entries,
  preferences,
  now = isoNow()
}: {
  auditDir?: string;
  entries: any[];
  preferences: any;
  now?: string;
}) {
  const notifications = entries
    .filter((entry) => shouldNotify(entry, preferences))
    .map((entry) => notificationFromEntry(entry, now));

  if (notifications.length) {
    await mkdir(auditDir, { recursive: true });
    await appendFile(
      path.join(auditDir, NOTIFICATIONS_FILE),
      notifications.map((item) => JSON.stringify(item)).join("\n") + "\n"
    );
  }

  return notifications;
}

export async function readLifecycleNotifications(auditDir = "audits") {
  try {
    const text = await readFile(path.join(auditDir, NOTIFICATIONS_FILE), "utf8");
    return {
      schema_version: "0.1.0",
      audit_dir: auditDir,
      notifications: parseJsonLines(text).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    };
  } catch (error: any) {
    if (error.code !== "ENOENT") throw error;
    return {
      schema_version: "0.1.0",
      audit_dir: auditDir,
      notifications: []
    };
  }
}
