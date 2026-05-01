import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { stableHash } from "./core/ids.js";

export async function writeAuditBundle(dossier, { auditDir = "audits" } = {}) {
  await mkdir(auditDir, { recursive: true });
  const filePath = path.join(auditDir, `${dossier.id}.json`);
  const body = {
    schema_version: "0.1.0",
    dossier,
    hash: stableHash(dossier)
  };
  await writeFile(filePath, `${JSON.stringify(body, null, 2)}\n`);
  return filePath;
}

export async function readAuditBundle(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

export function replayAuditBundle(bundle) {
  const currentHash = stableHash(bundle.dossier);
  return {
    valid: currentHash === bundle.hash,
    expected_hash: bundle.hash,
    actual_hash: currentHash,
    decision_packet: bundle.dossier.decision_packet
  };
}
