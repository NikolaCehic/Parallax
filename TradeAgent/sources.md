# Sources And Grounding

Checked on 2026-04-30. These are not exhaustive legal requirements; they are design anchors for a safer financial/trading analysis system.

## AI and model risk

- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
  - Useful design implication: build governance, mapping, measurement, and management into the system instead of treating safety as an afterthought.
- NIST AI RMF Generative AI Profile, NIST-AI-600-1, linked from the AI RMF page.
  - Useful design implication: treat generated analysis as fallible, provenance-sensitive, and subject to misuse, hallucination, and overreliance risks.
- Federal Reserve and OCC SR 11-7, Supervisory Guidance on Model Risk Management: https://www.federalreserve.gov/bankinforeg/srletters/sr1107.htm
  - Useful design implication: separate model development, independent validation, implementation controls, governance, and ongoing monitoring.

## Broker-dealer, adviser, and trading controls

- FINRA Regulatory Notice 24-09 on generative AI and LLMs: https://www.finra.org/rules-guidance/notices/24-09
  - Useful design implication: existing supervision, recordkeeping, privacy, accuracy, and model-risk obligations still matter when AI tools are used.
- FINRA Algorithmic Trading topic page: https://www.finra.org/rules-guidance/key-topics/algorithmic-trading
  - Useful design implication: use cross-disciplinary review, software testing, validation, supervision, and surveillance for algorithmic strategies.
- SEC Rule 15c3-5, Market Access Rule overview: https://www.sec.gov/rules-regulations/2011/06/risk-management-controls-brokers-or-dealers-market-access
  - Useful design implication: automated pre-trade risk controls, supervisory procedures, access restrictions, and financial exposure limits are central if any live market access exists.
- SEC proposed requirements for conflicts of interest from predictive data analytics: https://www.sec.gov/newsroom/press-releases/2023-140
  - Useful design implication: detect and neutralize incentives that make the system optimize for the provider rather than the investor/user.
- SEC AI washing enforcement release: https://www.sec.gov/newsroom/press-releases/2024-36
  - Useful design implication: the harness must make truthful, auditable claims about where AI is used and where deterministic tools or humans are making decisions.
- CFTC customer advisory on generative AI fraud: https://www.cftc.gov/PressRoom/PressReleases/9056-25
  - Useful design implication: protect users from AI-enabled manipulation, fake sources, synthetic identities, and persuasive but unsupported trading narratives.

## Resulting non-negotiables

1. The system must separate analysis from order execution.
2. The system must log data lineage, prompt/model versions, tool outputs, dissent, and final rationale.
3. Risk, compliance, data quality, and model validation must have hard veto power.
4. Numeric claims must be produced or checked by deterministic tools, not accepted from generated prose.
5. The default action class must include "no trade" and "research needed," not only buy/sell.
6. The system must be designed for paper trading, validation, and monitored rollout before any live execution path.
