import { spawnSync } from "node:child_process";
import { loadCliConfig } from "./config.js";
import { liveLLMHealthCheck, resolveLiveLLMConfig } from "./llm/live.js";

function pythonExecutable() {
  return process.env.PARALLAX_PYTHON ?? "python3";
}

function checkPython() {
  const command = pythonExecutable();
  const result = spawnSync(command, ["--version"], {
    encoding: "utf8"
  });
  if (result.error) {
    return {
      ok: false,
      command,
      version: "",
      message: result.error.message
    };
  }
  return {
    ok: result.status === 0,
    command,
    version: `${result.stdout || result.stderr}`.trim(),
    message: result.status === 0 ? "ready" : `${result.stderr || result.stdout}`.trim()
  };
}

function checkNode() {
  const major = Number(process.versions.node.split(".")[0]);
  return {
    ok: major >= 20,
    version: process.version,
    required: ">=20"
  };
}

export async function parallaxDoctor({
  live = false,
  llmProviderOptions = {},
  rootDir = process.cwd()
}: {
  live?: boolean;
  llmProviderOptions?: any;
  rootDir?: string;
} = {}) {
  const node = checkNode();
  const python = checkPython();
  const workspaceConfig = await loadCliConfig(rootDir);
  const llm = resolveLiveLLMConfig(llmProviderOptions);
  const checks: any[] = [
    {
      id: "node",
      ok: node.ok,
      detail: `${node.version} required ${node.required}`
    },
    {
      id: "python",
      ok: python.ok,
      detail: python.ok ? `${python.command} ${python.version}` : `${python.command} failed: ${python.message}`
    },
    {
      id: "workspace_config",
      ok: Boolean(workspaceConfig),
      detail: workspaceConfig ? `.parallax/config.json loaded for ${workspaceConfig.project_name}` : "not initialized; run parallax init"
    },
    {
      id: "llm_api_key",
      ok: llm.api_key_present,
      detail: llm.api_key_present
        ? `present via ${llm.api_key_env}`
        : `missing ${llm.api_key_env}`
    },
    {
      id: "llm_model",
      ok: Boolean(llm.model),
      detail: `${llm.provider}/${llm.model} at ${llm.redacted_base_url}`
    }
  ];

  let liveCheck: any = null;
  if (live) {
    try {
      liveCheck = await liveLLMHealthCheck({ providerOptions: llmProviderOptions });
      checks.push({
        id: "llm_live_network",
        ok: liveCheck.ok,
        detail: liveCheck.ok ? `response ${liveCheck.response_id || "ok"}` : liveCheck.message
      });
    } catch (error: any) {
      liveCheck = {
        ok: false,
        message: error.message
      };
      checks.push({
        id: "llm_live_network",
        ok: false,
        detail: error.message
      });
    }
  }

  return {
    status: checks.every((check) => check.ok) ? "ready" : "needs_attention",
    node,
    python,
    workspace: {
      initialized: Boolean(workspaceConfig),
      project_name: workspaceConfig?.project_name ?? "",
      audit_dir: workspaceConfig?.audit_dir ?? "audits",
      data_dir: workspaceConfig?.data_dir ?? "fixtures",
      default_council_mode: workspaceConfig?.default_council_mode ?? "deterministic"
    },
    llm: {
      provider: llm.provider,
      model: llm.model,
      base_url: llm.redacted_base_url,
      api_key_env: llm.api_key_env,
      api_key_present: llm.api_key_present,
      timeout_ms: llm.timeout_ms,
      max_output_tokens: llm.max_output_tokens
    },
    live_check: liveCheck,
    checks,
    next_live_command: [
      "parallax analyze",
      "--symbol NVDA",
      "--horizon swing",
      "--thesis \"post-earnings continuation with controlled risk\"",
      "--ceiling watchlist",
      "--council-mode llm-live"
    ].join(" ")
  };
}
