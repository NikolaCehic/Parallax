import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isoNow } from "./core/ids.js";

export type ParallaxCliConfig = {
  version: string;
  created_at: string;
  project_name: string;
  audit_dir: string;
  data_dir: string;
  default_symbol: string;
  default_horizon: string;
  default_ceiling: string;
  default_council_mode: string;
  user_class: string;
  intended_use: string;
  llm: {
    provider: string;
    model: string;
    base_url: string;
    api_key_env: string;
  };
};

const CONFIG_DIR = ".parallax";
const CONFIG_FILE = "config.json";

function modulePackageRoot() {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
}

async function pathExists(filePath: string) {
  try {
    await stat(filePath);
    return true;
  } catch (error: any) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeIfAllowed(filePath: string, value: string, force: boolean) {
  if (!force && await pathExists(filePath)) {
    return "already_exists";
  }
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, value);
  return "written";
}

export function configPathFor(rootDir = process.cwd()) {
  return path.join(rootDir, CONFIG_DIR, CONFIG_FILE);
}

export async function loadCliConfig(rootDir = process.cwd()): Promise<ParallaxCliConfig | null> {
  try {
    return JSON.parse(await readFile(configPathFor(rootDir), "utf8"));
  } catch (error: any) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export function defaultCliConfig({
  projectName = path.basename(process.cwd()),
  now = isoNow(),
  councilMode = "deterministic",
  llmModel = "gpt-5-mini"
}: {
  projectName?: string;
  now?: string;
  councilMode?: string;
  llmModel?: string;
} = {}): ParallaxCliConfig {
  return {
    version: "1",
    created_at: now,
    project_name: projectName,
    audit_dir: "audits",
    data_dir: "fixtures",
    default_symbol: "NVDA",
    default_horizon: "swing",
    default_ceiling: "watchlist",
    default_council_mode: councilMode,
    user_class: "self_directed_investor",
    intended_use: "research",
    llm: {
      provider: "openai",
      model: llmModel,
      base_url: "https://api.openai.com/v1",
      api_key_env: "OPENAI_API_KEY"
    }
  };
}

export async function initializeCliWorkspace({
  rootDir = process.cwd(),
  projectName,
  force = false,
  skipFixtures = false,
  councilMode = "deterministic",
  llmModel = "gpt-5-mini",
  now = isoNow()
}: {
  rootDir?: string;
  projectName?: string;
  force?: boolean;
  skipFixtures?: boolean;
  councilMode?: string;
  llmModel?: string;
  now?: string;
} = {}) {
  const absoluteRoot = path.resolve(rootDir);
  const config = defaultCliConfig({
    projectName: projectName ?? path.basename(absoluteRoot),
    now,
    councilMode,
    llmModel
  });
  const configPath = configPathFor(absoluteRoot);
  const auditDir = path.join(absoluteRoot, config.audit_dir);
  const fixturesDir = path.join(absoluteRoot, config.data_dir);
  const envPath = path.join(absoluteRoot, ".env.example");
  const workspaceReadmePath = path.join(absoluteRoot, CONFIG_DIR, "README.md");
  const gitignoreAdvicePath = path.join(absoluteRoot, CONFIG_DIR, "gitignore-recommended.txt");

  await mkdir(auditDir, { recursive: true });
  await writeIfAllowed(path.join(auditDir, ".gitkeep"), "", force);

  const configStatus = await writeIfAllowed(configPath, `${JSON.stringify(config, null, 2)}\n`, force);
  const envStatus = await writeIfAllowed(envPath, [
    "# Parallax local environment",
    "# Do not commit real API keys.",
    "OPENAI_API_KEY=",
    "PARALLAX_LLM_MODEL=gpt-5-mini",
    "PARALLAX_LLM_BASE_URL=https://api.openai.com/v1",
    "PARALLAX_PYTHON=python3",
    ""
  ].join("\n"), force);
  const readmeStatus = await writeIfAllowed(workspaceReadmePath, [
    "# Parallax Workspace",
    "",
    "This directory was initialized by `parallax init`.",
    "",
    "## First Commands",
    "",
    "```bash",
    "parallax doctor",
    "parallax analyze --symbol NVDA --thesis \"post-earnings continuation with controlled risk\"",
    "```",
    "",
    "For a live LLM council:",
    "",
    "```bash",
    "export OPENAI_API_KEY=\"sk-...\"",
    "parallax analyze --symbol NVDA --thesis \"...\" --council-mode llm-live",
    "```",
    ""
  ].join("\n"), force);
  const gitignoreAdviceStatus = await writeIfAllowed(gitignoreAdvicePath, [
    "# Recommended entries for your project .gitignore",
    ".env",
    "audits/",
    "managed-saas/",
    "*.local.json",
    ""
  ].join("\n"), force);

  let fixturesStatus = "skipped";
  if (!skipFixtures) {
    if (!force && await pathExists(fixturesDir)) {
      fixturesStatus = "already_exists";
    } else {
      const sourceFixtures = path.join(modulePackageRoot(), "fixtures");
      await cp(sourceFixtures, fixturesDir, { recursive: true, force: true });
      fixturesStatus = "copied";
    }
  }

  return {
    root_dir: absoluteRoot,
    config,
    config_path: configPath,
    audit_dir: auditDir,
    fixtures_dir: fixturesDir,
    env_path: envPath,
    workspace_readme_path: workspaceReadmePath,
    gitignore_advice_path: gitignoreAdvicePath,
    statuses: {
      config: configStatus,
      audit_dir: "ready",
      fixtures: fixturesStatus,
      env: envStatus,
      workspace_readme: readmeStatus,
      gitignore_advice: gitignoreAdviceStatus
    },
    next_commands: [
      "parallax doctor",
      "parallax analyze --symbol NVDA --thesis \"post-earnings continuation with controlled risk\"",
      "parallax analyze --symbol NVDA --thesis \"post-earnings continuation\" --council-mode llm-live"
    ]
  };
}
