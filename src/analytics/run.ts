import { spawnSync } from "node:child_process";
import path from "node:path";
import { makeId, stableHash, isoNow } from "../core/ids.js";

function defaultPythonExecutable() {
  if (process.env.PARALLAX_PYTHON) return process.env.PARALLAX_PYTHON;
  return "python3";
}

function toolOutput({ toolName, inputIds, result, status = "passed", now = isoNow() }: any) {
  const body = {
    tool_name: toolName,
    tool_version: "0.1.0",
    inputs: inputIds,
    created_at: now,
    status,
    result
  };
  return {
    id: makeId("tool", body),
    ...body,
    result_hash: stableHash(result)
  };
}

export function runAnalytics(snapshot: any, { now = isoNow(), pythonExecutable = defaultPythonExecutable() }: any = {}) {
  const workerPath = path.resolve("python", "parallax_analytics.py");
  const result = spawnSync(pythonExecutable, [workerPath], {
    input: JSON.stringify(snapshot),
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });

  if (result.error) {
    throw new Error(`Python analytics worker failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Python analytics worker failed: ${result.stderr || result.stdout}`);
  }

  const pythonOutputs = JSON.parse(result.stdout);
  return pythonOutputs.map((output: any) => toolOutput({
    toolName: output.tool_name,
    inputIds: output.input_ids,
    status: output.status,
    result: output.result,
    now
  }));
}

export function toolByName(toolOutputs: any[], toolName: string) {
  return toolOutputs.find((output) => output.tool_name === toolName);
}
