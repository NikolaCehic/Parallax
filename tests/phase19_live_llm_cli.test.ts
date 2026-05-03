import test from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { analyzeThesis } from "../src/index.js";
import { PERSONAS } from "../src/council/personas.js";

const CLI = "dist/src/cli/parallax.js";
const NOW = "2026-05-01T14:30:00Z";

function runCli(args: string[], env: Record<string, string> = {}) {
  return execFileSync(process.execPath, [CLI, ...args], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      PARALLAX_PYTHON: process.env.PARALLAX_PYTHON ?? "python3",
      ...env
    }
  });
}

function runCliAsync(args: string[], env: Record<string, string> = {}) {
  return new Promise<string>((resolve, reject) => {
    execFile(process.execPath, [CLI, ...args], {
      cwd: process.cwd(),
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        PARALLAX_PYTHON: process.env.PARALLAX_PYTHON ?? "python3",
        ...env
      }
    }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(`${error.message}\n${stderr}\n${stdout}`));
        return;
      }
      resolve(stdout);
    });
  });
}

async function readBody(req: any) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

async function startMockResponsesServer() {
  const requests: any[] = [];
  const server = createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/responses") {
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: "not found" } }));
      return;
    }

    const body = JSON.parse(await readBody(req));
    requests.push({
      authorization: req.headers.authorization,
      body
    });
    const text = body.input?.[0]?.content?.[0]?.text ?? "{}";
    const payload = JSON.parse(text);
    const refs = payload.context?.allowed_ref_ids ?? ["ev_mock"];
    const personaId = payload.persona_id ?? "doctor";
    const draft = {
      stance: personaId === "red_team_skeptic" ? "needs_more_data" : "support",
      confidence: 0.62,
      claim_type: "inference",
      thesis: `${personaId} live mock reviewed the frozen evidence and kept the action at watchlist.`,
      evidence_refs: refs.slice(0, 2),
      assumptions: ["Live mock keeps all claims tied to the supplied context."],
      base_rates: [],
      invalidators: ["Fresh evidence contradicts the setup."],
      risks: ["Model interpretation risk"],
      required_checks: ["Human review before any escalation."],
      proposed_action: "watchlist",
      veto: { active: false, reason: "" }
    };

    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({
      id: `resp_mock_${requests.length}`,
      output_text: JSON.stringify(draft),
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150
      }
    }));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
    close: () => new Promise<void>((resolve, reject) =>
      server.close((error) => error ? reject(error) : resolve())
    )
  };
}

test("Phase 19 live LLM mode fails closed when no API key is configured", async () => {
  const dossier = await analyzeThesis({
    symbol: "NVDA",
    horizon: "swing",
    thesis: "live provider missing key should fail closed",
    actionCeiling: "watchlist",
    councilMode: "llm-live",
    llmProviderOptions: {
      apiKey: "",
      apiKeyEnv: "PARALLAX_TEST_MISSING_KEY"
    },
    now: NOW
  });

  assert.equal(dossier.council_run.provider.kind, "llm_live_openai_responses");
  assert.equal(dossier.council_run.eval_report.passed, false);
  assert.equal(dossier.decision_packet.action_class, "no_trade");
  assert.ok(dossier.council_run.eval_report.problems.some((problem: string) =>
    problem.includes("missing_live_llm_api_key")
  ));
});

test("Phase 19 CLI doctor explains live LLM setup without making a network call by default", () => {
  const output = runCli([
    "doctor",
    "--llm-base-url", "http://127.0.0.1:9",
    "--llm-api-key-env", "PARALLAX_LLM_API_KEY"
  ], {
    PARALLAX_LLM_API_KEY: "test-key"
  });

  assert.match(output, /Parallax CLI Doctor/);
  assert.match(output, /API key: present via PARALLAX_LLM_API_KEY/);
  assert.match(output, /Network check: skipped/);
  assert.match(output, /--council-mode llm-live/);
});

test("Phase 19 CLI analyze can use a real Responses-compatible LLM API key path", async () => {
  const server = await startMockResponsesServer();
  const auditDir = await mkdtemp(path.join(os.tmpdir(), "parallax-live-llm-cli-"));
  try {
    const output = await runCliAsync([
      "analyze",
      "--symbol", "NVDA",
      "--horizon", "swing",
      "--thesis", "live LLM council path should produce a governed dossier",
      "--ceiling", "watchlist",
      "--council-mode", "llm-live",
      "--llm-base-url", server.baseUrl,
      "--llm-model", "test-live-model",
      "--llm-api-key-env", "PARALLAX_LLM_API_KEY",
      "--now", NOW,
      "--audit-dir", auditDir
    ], {
      PARALLAX_LLM_API_KEY: "test-key"
    });

    assert.match(output, /Council provider: openai_responses_live_v0/);
    assert.match(output, /Council evaluation: passed/);
    assert.match(output, /Context windows:/);
    assert.match(output, /Estimated LLM cost:/);
    assert.equal(server.requests.length, PERSONAS.length);
    assert.ok(server.requests.every((request) => request.authorization === "Bearer test-key"));
    assert.ok(server.requests.every((request) => request.body.model === "test-live-model"));
  } finally {
    await rm(auditDir, { recursive: true, force: true });
    await server.close();
  }
});
