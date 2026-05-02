export const DEFAULT_MODEL_REGISTRY = {
  "rule_council_v0": {
    kind: "persona_engine",
    version: "0.1.0",
    validation_status: "prototype_validated",
    owner: "parallax",
    notes: "Deterministic rule-based council used for replayable local prototype."
  }
};

export const DEFAULT_TOOL_REGISTRY = {
  return_summary: { version: "0.1.0", validation_status: "prototype_validated" },
  volatility_check: { version: "0.1.0", validation_status: "prototype_validated" },
  drawdown_check: { version: "0.1.0", validation_status: "prototype_validated" },
  liquidity_check: { version: "0.1.0", validation_status: "prototype_validated" },
  transaction_cost_model: { version: "0.1.0", validation_status: "prototype_validated" },
  dependency_correlation: { version: "0.1.0", validation_status: "prototype_validated" },
  portfolio_exposure_check: { version: "0.1.0", validation_status: "prototype_validated" },
  event_calendar_check: { version: "0.1.0", validation_status: "prototype_validated" },
  data_quality_check: { version: "0.1.0", validation_status: "prototype_validated" }
};

export function validateGovernedRelease({
  modelRegistry = DEFAULT_MODEL_REGISTRY,
  toolRegistry = DEFAULT_TOOL_REGISTRY,
  dossier
}) {
  const problems = [];
  const councilModelRef = dossier.council_run?.provider?.model_registry_ref ?? "rule_council_v0";
  const councilModel = modelRegistry[councilModelRef];
  if (!councilModel) {
    problems.push(`Council model ${councilModelRef} is not registered.`);
  } else if (!councilModel.validation_status.includes("validated")) {
    problems.push(`Council model ${councilModelRef} is not validated.`);
  }
  if (!dossier.policy_review) {
    problems.push("Product policy review is missing.");
  } else {
    if (dossier.policy_review.status === "blocked" && dossier.decision_packet.action_class !== "no_trade") {
      problems.push("Blocked product-policy request did not resolve to no_trade.");
    }
    if (dossier.decision_packet.action_class === "order_ticket_candidate") {
      problems.push("General product release cannot emit order_ticket_candidate.");
    }
  }
  if (dossier.council_run?.eval_report && !dossier.council_run.eval_report.passed) {
    problems.push("Council claim-packet evaluation did not pass.");
  }
  for (const output of dossier.tool_outputs) {
    const registered = toolRegistry[output.tool_name];
    if (!registered) {
      problems.push(`Tool ${output.tool_name} is not registered.`);
    } else if (registered.version !== output.tool_version) {
      problems.push(`Tool ${output.tool_name} version mismatch.`);
    } else if (!registered.validation_status.includes("validated")) {
      problems.push(`Tool ${output.tool_name} is not validated.`);
    }
  }
  return {
    passed: problems.length === 0,
    problems
  };
}

export function calibrationReport(dossiers = [], paperOutcomes = []) {
  const total = dossiers.length;
  const vetoed = dossiers.filter((dossier) => dossier.decision_packet.vetoes.length > 0).length;
  const staleOrInvalid = dossiers.filter((dossier) => ["stale", "invalidated"].includes(dossier.lifecycle.state)).length;
  const paperClosed = paperOutcomes.length;
  const profitablePaper = paperOutcomes.filter((outcome) => outcome.realized_pnl > 0).length;
  return {
    dossier_count: total,
    veto_rate: total ? vetoed / total : 0,
    stale_or_invalid_rate: total ? staleOrInvalid / total : 0,
    paper_outcome_count: paperClosed,
    profitable_paper_rate: paperClosed ? profitablePaper / paperClosed : 0,
    note: "Calibration is descriptive only; it must not auto-change prompts, personas, or strategies."
  };
}
