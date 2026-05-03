import { spawnSync } from "node:child_process";
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
  llmProviderOptions = {}
}: {
  live?: boolean;
  llmProviderOptions?: any;
} = {}) {
  const node = checkNode();
  const python = checkPython();
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
