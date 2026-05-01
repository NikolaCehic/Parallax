import { createHash } from "node:crypto";

export function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

export function stableHash(value) {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}

export function makeId(prefix, payload) {
  return `${prefix}_${stableHash(payload).slice(0, 12)}`;
}

export function clamp(value, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

export function isoNow() {
  return new Date().toISOString();
}

export function daysBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / 86_400_000;
}
