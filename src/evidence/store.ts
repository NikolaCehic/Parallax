import { makeId, stableHash, isoNow } from "../core/ids.js";
import {
  DEFAULT_DEPENDENCIES,
  loadCorporateActions,
  loadDataManifest,
  loadEvents,
  loadFundamentals,
  loadMarketData,
  loadNews,
  loadPortfolio
} from "../data/adapters.js";

function evidenceItem({ kind, source, symbol, asOf, retrievedAt, freshnessStatus, license = "internal", payload, metadata = {} }) {
  const payloadHash = stableHash(payload);
  const item = {
    id: makeId("ev", { kind, source, symbol, asOf, payloadHash }),
    kind,
    source,
    symbol,
    as_of: asOf,
    retrieved_at: retrievedAt,
    freshness_status: freshnessStatus,
    license,
    payload_ref: `inline:${payloadHash}`,
    hash: payloadHash,
    payload,
    metadata
  };
  return item;
}

function itemFromAdapter(adapterResult, now) {
  return evidenceItem({
    kind: adapterResult.kind,
    source: adapterResult.source,
    symbol: adapterResult.symbol,
    asOf: adapterResult.asOf,
    retrievedAt: now,
    freshnessStatus: adapterResult.freshnessStatus,
    license: adapterResult.license,
    payload: adapterResult.payload,
    metadata: adapterResult.metadata ?? {}
  });
}

export async function buildEvidenceSnapshot({
  symbol,
  horizon = "swing",
  thesis,
  dataDir = "fixtures",
  now = isoNow(),
  dependencies = DEFAULT_DEPENDENCIES[symbol] ?? []
}) {
  const manifest = await loadDataManifest(dataDir);
  const items = [];

  const corporateActions = await loadCorporateActions({ dataDir, symbol, now, manifest });
  const market = await loadMarketData({ dataDir, symbol, now, corporateActions: corporateActions.payload, manifest });
  items.push(itemFromAdapter(market, now));

  for (const dependency of dependencies) {
    try {
      const depActions = await loadCorporateActions({ dataDir, symbol: dependency, now, manifest });
      const depMarket = await loadMarketData({
        dataDir,
        symbol: dependency,
        now,
        corporateActions: depActions.payload,
        manifest
      });
      items.push(itemFromAdapter(depMarket, now));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }

  items.push(itemFromAdapter(await loadPortfolio({ dataDir, now, manifest }), now));
  items.push(itemFromAdapter(await loadEvents({ dataDir, symbol, now, manifest }), now));
  items.push(itemFromAdapter(corporateActions, now));

  const fundamentals = await loadFundamentals({ dataDir, symbol, now, manifest });
  if (fundamentals) items.push(itemFromAdapter(fundamentals, now));

  const news = await loadNews({ dataDir, symbol, now, manifest });
  if (news) items.push(itemFromAdapter(news, now));

  const question = {
    symbol,
    horizon,
    thesis,
    requested_action: "analyze",
    dependencies,
    data_provider: manifest.provider ?? "local_files",
    data_license: manifest.license ?? "internal"
  };

  const snapshot = {
    id: makeId("snap", { question, items: items.map((item) => item.hash), now }),
    created_at: now,
    question,
    items,
    hash: stableHash({ question, items: items.map((item) => item.hash) })
  };

  return snapshot;
}

export function getEvidence(snapshot, kind, symbol) {
  return snapshot.items.find((item) => item.kind === kind && (symbol === undefined || item.symbol === symbol));
}
