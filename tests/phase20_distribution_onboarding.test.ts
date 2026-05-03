import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { initializeCliWorkspace, loadCliConfig } from "../src/index.js";

const CLI = path.resolve("dist/src/cli/parallax.js");
const NOW = "2026-05-01T14:30:00Z";

function runCli(args: string[], cwd: string, env: Record<string, string> = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      PARALLAX_PYTHON: process.env.PARALLAX_PYTHON ?? "python3",
      ...env
    }
  });
}

async function exists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

test("Phase 20 init creates a complete project-local onboarding workspace", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-init-unit-"));
  try {
    const result = await initializeCliWorkspace({
      rootDir,
      projectName: "Unit Workspace",
      councilMode: "llm-live",
      llmModel: "gpt-5-mini",
      now: NOW
    });

    assert.equal(result.config.project_name, "Unit Workspace");
    assert.equal(result.config.default_council_mode, "llm-live");
    assert.equal(await exists(path.join(rootDir, ".parallax", "config.json")), true);
    assert.equal(await exists(path.join(rootDir, ".parallax", "README.md")), true);
    assert.equal(await exists(path.join(rootDir, ".parallax", "gitignore-recommended.txt")), true);
    assert.equal(await exists(path.join(rootDir, ".env.example")), true);
    assert.equal(await exists(path.join(rootDir, "audits", ".gitkeep")), true);
    assert.equal(await exists(path.join(rootDir, "fixtures", "market", "NVDA.csv")), true);

    const loaded = await loadCliConfig(rootDir);
    assert.equal(loaded?.project_name, "Unit Workspace");
    assert.equal(loaded?.llm.api_key_env, "OPENAI_API_KEY");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 20 CLI init, doctor, and analyze work from outside the repository", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "parallax-init-e2e-"));
  try {
    const initOutput = runCli([
      "init",
      "--project-name", "External CLI Workspace",
      "--now", NOW
    ], rootDir);
    assert.match(initOutput, /Parallax Workspace Init/);
    assert.match(initOutput, /Next Commands/);
    assert.match(initOutput, /Fixtures: copied/);

    const doctorOutput = runCli(["doctor"], rootDir);
    assert.match(doctorOutput, /Parallax CLI Doctor/);
    assert.match(doctorOutput, /Initialized: yes/);
    assert.match(doctorOutput, /External CLI Workspace/);

    const analyzeOutput = runCli([
      "analyze",
      "--symbol", "NVDA",
      "--thesis", "initialized workspace should analyze with package-relative Python",
      "--ceiling", "watchlist",
      "--now", NOW,
      "--json"
    ], rootDir);
    const parsed = JSON.parse(analyzeOutput);
    assert.equal(parsed.action_class, "watchlist");
    assert.match(parsed.audit_path, /audits\/dos_/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("Phase 20 package metadata is publishable open source CLI software", async () => {
  const packageJson = JSON.parse(await readFile("package.json", "utf8"));
  assert.equal(packageJson.name, "@nikolacehic/parallax");
  assert.equal(packageJson.private, undefined);
  assert.equal(packageJson.license, "Apache-2.0");
  assert.equal(packageJson.bin.parallax, "./dist/src/cli/parallax.js");
  assert.equal(packageJson.exports["."].import, "./dist/src/index.js");
  assert.ok(packageJson.files.includes("dist/src"));
  assert.ok(packageJson.files.includes("python"));
  assert.ok(packageJson.files.includes("fixtures"));
  assert.ok(packageJson.scripts.prepack);
});

test("Phase 20 npm package dry-run includes runtime files and excludes compiled tests", () => {
  const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], {
    cwd: process.cwd(),
    encoding: "utf8"
  });
  const [pack] = JSON.parse(output);
  const files = pack.files.map((file: any) => file.path);
  assert.ok(files.includes("dist/src/cli/parallax.js"));
  assert.ok(files.includes("python/parallax_analytics.py"));
  assert.ok(files.includes("fixtures/market/NVDA.csv"));
  assert.ok(files.includes("LICENSE"));
  assert.equal(files.some((file: string) => file.startsWith("dist/tests/")), false);
});

test("Phase 20 onboarding plan and community files are present", async () => {
  const onboarding = await readFile("ONBOARDING_PLAN.md", "utf8");
  assert.match(onboarding, /Golden Path/);
  assert.match(onboarding, /parallax init/);
  assert.match(onboarding, /Acceptance Criteria/);

  for (const file of [
    "LICENSE",
    "CONTRIBUTING.md",
    "SECURITY.md",
    "CODE_OF_CONDUCT.md",
    "CHANGELOG.md",
    ".github/workflows/ci.yml",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/ISSUE_TEMPLATE/bug_report.yml",
    ".github/ISSUE_TEMPLATE/feature_request.yml"
  ]) {
    assert.equal(await exists(file), true, `${file} should exist`);
  }
});
