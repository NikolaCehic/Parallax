#!/usr/bin/env node
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { analyzeThesis, readAuditBundle, replayAuditBundle, evaluateLifecycle } from "../index.js";
import {
  dossierToHumanReport,
  dossierToMarkdown,
  monitorToHumanReport,
  paperToHumanReport,
  replayToHumanReport,
  sandboxToHumanReport
} from "../render.js";
import { createPaperTicket, simulatePaperFill } from "../paper/trading.js";
import { ApprovalStore, SandboxBroker, KillSwitch } from "../execution/sandbox.js";

type CliArgs = Record<string, string | boolean>;

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item.startsWith("--")) {
      const key = item.slice(2);
      const next = argv[index + 1];
      if (!next || next.startsWith("--")) args[key] = true;
      else {
        args[key] = next;
        index += 1;
      }
    }
  }
  return args;
}

function usage() {
  return `Parallax CLI

Commands:
  analyze --symbol NVDA --horizon swing --thesis "post-earnings continuation" [--ceiling watchlist]
  replay --audit audits/dos_x.json
  monitor --audit audits/dos_x.json --price 1050 --now 2026-05-01T15:00:00Z
  paper --audit audits/dos_x.json
  sandbox-submit --audit audits/dos_x.json --approver "human"

Common flags:
  --json                 Print machine-readable JSON instead of human-readable output.
  --format json|human    Same as --json, but explicit.
  --data-dir fixtures    Directory containing market/events/portfolio fixture data.
  --audit-dir audits     Directory where analyze writes audit artifacts.
`;
}

function wantsJson(args: CliArgs) {
  return args.json === true || args.format === "json";
}

function printResult(args: CliArgs, human: string, json: any) {
  if (wantsJson(args)) console.log(JSON.stringify(json, null, 2));
  else console.log(human);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const args = parseArgs(rest);

  if (!command || args.help) {
    console.log(usage());
    return;
  }

  if (command === "analyze") {
    if (!args.symbol || !args.thesis) throw new Error("analyze requires --symbol and --thesis");
    const dossier = await analyzeThesis({
      symbol: String(args.symbol),
      horizon: String(args.horizon ?? "swing"),
      thesis: String(args.thesis),
      dataDir: String(args["data-dir"] ?? "fixtures"),
      actionCeiling: String(args.ceiling ?? "watchlist"),
      audit: true,
      now: args.now ? String(args.now) : undefined,
      auditDir: String(args["audit-dir"] ?? "audits")
    });
    const auditPath = path.join(String(args["audit-dir"] ?? "audits"), `${dossier.id}.json`);
    const markdownPath = path.join(String(args["audit-dir"] ?? "audits"), `${dossier.id}.md`);
    await writeFile(markdownPath, dossierToMarkdown(dossier));
    const result = {
      dossier_id: dossier.id,
      action_class: dossier.decision_packet.action_class,
      thesis_state: dossier.lifecycle.state,
      confidence: dossier.decision_packet.confidence,
      freshness_score: dossier.lifecycle.freshness_score,
      audit_path: auditPath,
      markdown_path: markdownPath
    };
    printResult(args, dossierToHumanReport(dossier, { auditPath, markdownPath }), result);
    return;
  }

  if (command === "replay") {
    if (!args.audit) throw new Error("replay requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const replay = replayAuditBundle(bundle);
    printResult(args, replayToHumanReport(replay), replay);
    return;
  }

  if (command === "monitor") {
    if (!args.audit) throw new Error("monitor requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const lastPrice = args.price ? Number(args.price) : bundle.dossier.tool_outputs.find((output: any) => output.tool_name === "return_summary").result.latest_close;
    const updated = evaluateLifecycle(bundle.dossier.lifecycle, {
      now: String(args.now ?? new Date().toISOString()),
      last_price: lastPrice,
      annualized_volatility_20: args.vol ? Number(args.vol) : 0.3,
      material_event_arrives: args.event === "true"
    });
    printResult(args, monitorToHumanReport(updated), updated);
    return;
  }

  if (command === "paper") {
    if (!args.audit) throw new Error("paper requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const ticket = createPaperTicket(bundle.dossier);
    const filled = simulatePaperFill(ticket);
    const result = { ticket, filled };
    printResult(args, paperToHumanReport(result), result);
    return;
  }

  if (command === "sandbox-submit") {
    if (!args.audit) throw new Error("sandbox-submit requires --audit");
    const bundle = await readAuditBundle(String(args.audit));
    const ticket = createPaperTicket(bundle.dossier);
    const approvals = new ApprovalStore();
    approvals.approve(ticket, { approver: String(args.approver ?? "human") });
    const broker = new SandboxBroker({ approvalStore: approvals, killSwitch: new KillSwitch() });
    const submitted = broker.submit({ dossier: bundle.dossier, ticket });
    printResult(args, sandboxToHumanReport(submitted), submitted);
    return;
  }

  throw new Error(`Unknown command: ${command}\n${usage()}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
