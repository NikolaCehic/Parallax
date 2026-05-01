import test from "node:test";
import assert from "node:assert/strict";
import { analyzeThesis } from "../src/index.js";
import { validateGovernedRelease, calibrationReport } from "../src/governance/registry.js";

test("governance release validation checks registered tools", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "governance test",
    now: "2026-05-01T14:30:00Z"
  });

  const result = validateGovernedRelease({ dossier });
  assert.equal(result.passed, true);
});

test("calibration report is descriptive", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "calibration test",
    now: "2026-05-01T14:30:00Z"
  });

  const report = calibrationReport([dossier], []);
  assert.equal(report.dossier_count, 1);
  assert.match(report.note, /must not auto-change/);
});
