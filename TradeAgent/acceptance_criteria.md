# Acceptance Criteria

User stopping condition:

> Iterate until the current best solution satisfies: "I do not see a better solution and I do not know how to make a better solution than the current best solution."

## Interpretation

The criterion is not "perfect trading performance." That is unknowable and would encourage overfitting. The criterion is architectural dominance: after 120 total Seed A/A+ iterations, no obvious missing subsystem, weaker alternative, or unhandled failure mode remains that would improve the harness without adding more risk than value.

## Evaluation Axes

Each candidate was judged against these axes:

1. epistemic quality: does it distinguish evidence, inference, uncertainty, and speculation?
2. market realism: does it handle transaction costs, liquidity, slippage, regime shifts, and crowded trades?
3. model risk: does it support independent validation, versioning, monitoring, and rollback?
4. compliance posture: does it preserve supervision, recordkeeping, conflicts review, and truthful AI claims?
5. safety: does it prevent unsupported analysis from becoming live orders?
6. modularity: can personas, tools, data vendors, brokers, and asset classes be swapped?
7. auditability: can a future reviewer reconstruct why the system said what it said?
8. adversarial strength: does the council make disagreement productive rather than theatrical?
9. usability: can a human portfolio manager or analyst understand the result quickly?
10. extensibility: can the harness start small and grow toward production without redesigning the core?
11. temporal validity: does every thesis expire, revalidate, downgrade, or invalidate as market conditions change?

## Converged Essence

The final solution is a governed adversarial council harness:

1. evidence and data lineage layer;
2. deterministic analytical tool layer;
3. multiaxial expert-persona council;
4. structured debate and synthesis protocol;
5. vetoed decision gate;
6. human-readable research memo and machine-readable decision packet;
7. thesis lifecycle engine with state, dynamic expiry, freshness scoring, and trigger-based revalidation;
8. separate paper/live execution adapters;
9. model-risk, compliance, and monitoring loop.

## Why No Better Solution Was Found

The dominant alternatives failed in predictable ways:

- A pure multi-agent debate is persuasive but unsafe without deterministic tools and vetoes.
- A pure quant engine is testable but weak at narrative, regime interpretation, and source critique.
- A monolithic "PM agent" is simple but too opaque and too vulnerable to hidden assumptions.
- A committee without hard gates creates the appearance of safety but still allows a bad synthesis to pass.
- A fully autonomous trading agent adds the most operational risk while contributing the least to analysis quality.
- A static research dossier becomes stale too quickly in live markets.

The current best solution keeps the useful part of each alternative while neutralizing its biggest failure mode.

## Second-Seed Convergence Test

Seed A began with the idea "council of expert personas."

Seed B began with the idea "adversarial risk-control system for machine-generated trade theses."

The second run converged to the same essence: the council is useful only inside a governed evidence and risk harness; deterministic tools own calculations; risk/compliance/data validators can veto; execution is separate and permissioned.

The 20 additional optimization iterations did not replace that essence. They added the missing temporal control layer: the system must treat every thesis as a living object with state, expiry, triggers, dependency links, and revalidation rules.

This satisfies the requested convergence condition in essence, not by identical naming.
