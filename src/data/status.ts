import { buildEvidenceSnapshot } from "../evidence/store.js";
import { DEFAULT_DEPENDENCIES } from "./adapters.js";

function countBy(items: any[], key: string) {
  return items.reduce((acc: Record<string, number>, item: any) => {
    const value = item[key] ?? "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function payloadSummary(item: any) {
  if (Array.isArray(item.payload)) return { rows: item.payload.length };
  if (item.payload && typeof item.payload === "object") {
    return { keys: Object.keys(item.payload).sort() };
  }
  return {};
}

export function summarizeEvidenceItems(items: any[]) {
  return {
    item_count: items.length,
    by_kind: countBy(items, "kind"),
    by_freshness: countBy(items, "freshness_status"),
    by_license: countBy(items, "license"),
    stale_items: items.filter((item) => item.freshness_status !== "fresh").map((item) => item.id),
    restricted_items: items.filter((item) => item.license === "restricted").map((item) => item.id),
    sources: items.map((item) => ({
      id: item.id,
      kind: item.kind,
      symbol: item.symbol,
      source: item.source,
      as_of: item.as_of,
      freshness_status: item.freshness_status,
      license: item.license,
      payload_ref: item.payload_ref,
      hash: item.hash,
      payload_summary: payloadSummary(item)
    }))
  };
}

export async function buildDataStatus({
  dataDir = "fixtures",
  symbol,
  horizon = "swing",
  thesis = "data status check",
  now,
  dependencies
}: {
  dataDir?: string;
  symbol: string;
  horizon?: string;
  thesis?: string;
  now?: string;
  dependencies?: string[];
}) {
  const snapshot = await buildEvidenceSnapshot({
    dataDir,
    symbol,
    horizon,
    thesis,
    now,
    dependencies: dependencies ?? DEFAULT_DEPENDENCIES[symbol] ?? []
  });
  const summary = summarizeEvidenceItems(snapshot.items);
  return {
    data_dir: dataDir,
    symbol,
    snapshot_id: snapshot.id,
    snapshot_hash: snapshot.hash,
    created_at: snapshot.created_at,
    passed: summary.stale_items.length === 0 && summary.restricted_items.length === 0,
    ...summary
  };
}
