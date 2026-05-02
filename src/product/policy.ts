import { ACTION_RANK, capActionClass } from "../core/schemas.js";
import { makeId, stableHash } from "../core/ids.js";

export const PRODUCT_NAME = "Parallax";

export const PRODUCT_POSITIONING = {
  public_description:
    "Parallax is a research accountability platform for trading ideas. It turns a thesis into an evidence-linked dossier, challenges assumptions, surfaces invalidators, and monitors whether the thesis remains defensible.",
  legal_posture:
    "Research support only. Parallax is not a broker, investment adviser, signal service, tax adviser, legal adviser, or live execution system.",
  product_rule:
    "The general product ceiling is no_trade, research_needed, watchlist, or paper_trade_candidate. Live execution is excluded from the general product.",
  user_promise:
    "Make unsupported conviction hard to hide."
} as const;

export const USER_CLASSES = [
  "self_directed_investor",
  "independent_analyst",
  "research_team",
  "trading_educator",
  "professional_reviewer"
] as const;

export const INTENDED_USES = [
  "research",
  "education",
  "paper_trading",
  "team_review",
  "governance_review"
] as const;

export const PRODUCT_ACTION_CEILING = "paper_trade_candidate";

export const RISK_DISCLOSURES = [
  "Parallax output is not investment advice or a recommendation to buy, sell, hold, or short any security.",
  "The dossier is a research artifact; it can be wrong, stale, incomplete, or based on flawed data.",
  "Markets change continuously, so every thesis must have freshness, invalidation, and recheck rules.",
  "Generated text cannot be the source of financial calculations; numeric claims must trace back to tool outputs.",
  "Paper-trading output is simulation only and must not be marketed as proof of future returns.",
  "Live execution is not part of the general Parallax product."
];

export const PROHIBITED_CLAIMS = [
  "Parallax predicts markets.",
  "Parallax guarantees profit or avoids loss.",
  "Parallax tells users what to buy or sell.",
  "Parallax replaces a financial adviser, broker, risk manager, or compliance reviewer.",
  "Parallax can safely execute live trades without explicit human and regulated partner controls.",
  "Paper-trading or backtest outcomes prove future live performance."
];

const RESEARCH_CEILING = "watchlist";
const BLOCKED_CEILING = "no_trade";

const POLICY_PATTERNS = [
  {
    id: "buy_sell_oracle",
    label: "Buy/sell oracle framing",
    severity: "reframe",
    pattern: /\b(should\s+i\s+(buy|sell|short|hold)|tell\s+me\s+what\s+to\s+(buy|sell|short)|what\s+should\s+i\s+buy|give\s+me\s+a\s+trade|stock\s+pick|buy\s+now|sell\s+now)\b/i,
    reason:
      "Parallax can analyze a thesis, but it cannot frame the output as a personalized buy/sell instruction.",
    capTo: RESEARCH_CEILING
  },
  {
    id: "live_execution",
    label: "Live execution request",
    severity: "block",
    pattern: /\b(execute|place\s+(an\s+)?order|send\s+(an\s+)?order|trade\s+for\s+me|auto[-\s]?trade|autotrade|connect\s+to\s+(my\s+)?broker|live\s+broker|market\s+order)\b/i,
    reason:
      "Live execution is outside the general Parallax product and requires separate regulated partner controls.",
    capTo: BLOCKED_CEILING
  },
  {
    id: "guaranteed_returns",
    label: "Guaranteed-return language",
    severity: "block",
    pattern: /\b(guarantee|guaranteed|risk[-\s]?free|can't\s+lose|cannot\s+lose|certain\s+profit|sure\s+profit|always\s+wins?|free\s+money)\b/i,
    reason:
      "Parallax cannot make or support claims of guaranteed profit, certainty, or risk-free trading.",
    capTo: BLOCKED_CEILING
  },
  {
    id: "adviser_substitution",
    label: "Adviser substitution",
    severity: "reframe",
    pattern: /\b(replace\s+(my\s+)?(advisor|adviser)|act\s+as\s+my\s+(advisor|adviser)|manage\s+my\s+portfolio|decide\s+for\s+me)\b/i,
    reason:
      "Parallax supports research review, but it does not replace professional advice or fiduciary judgment.",
    capTo: RESEARCH_CEILING
  }
] as const;

function normalizeUserClass(value?: string) {
  return USER_CLASSES.includes(value as any) ? value : "self_directed_investor";
}

function normalizeIntendedUse(value?: string) {
  return INTENDED_USES.includes(value as any) ? value : "research";
}

function safestCeiling(left: string, right: string) {
  return ACTION_RANK.get(left)! < ACTION_RANK.get(right)! ? left : right;
}

export function reviewProductPolicy({
  symbol,
  thesis,
  actionCeiling = "watchlist",
  userClass,
  intendedUse
}: {
  symbol: string;
  thesis: string;
  actionCeiling?: string;
  userClass?: string;
  intendedUse?: string;
}) {
  const normalizedUserClass = normalizeUserClass(userClass);
  const normalizedIntendedUse = normalizeIntendedUse(intendedUse);
  const requestedActionCeiling = actionCeiling;
  let effectiveActionCeiling = capActionClass(actionCeiling, PRODUCT_ACTION_CEILING);
  const controls: any[] = [];

  if (effectiveActionCeiling !== requestedActionCeiling) {
    controls.push({
      id: "general_product_ceiling",
      status: "capped",
      message:
        `Requested ceiling ${requestedActionCeiling} exceeds the general product ceiling ${PRODUCT_ACTION_CEILING}.`
    });
  }

  const joined = `${symbol} ${thesis}`;
  const matches = POLICY_PATTERNS
    .filter((rule) => rule.pattern.test(joined))
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      severity: rule.severity,
      reason: rule.reason,
      cap_to: rule.capTo
    }));

  for (const match of matches) {
    effectiveActionCeiling = safestCeiling(effectiveActionCeiling, match.cap_to);
    controls.push({
      id: match.id,
      status: match.severity === "block" ? "blocked" : "reframed",
      message: match.reason
    });
  }

  const hasBlock = matches.some((match) => match.severity === "block");
  const hasReframe = matches.some((match) => match.severity === "reframe");
  const status = hasBlock ? "blocked" : hasReframe ? "needs_reframe" : "allowed";

  if (!controls.length) {
    controls.push({
      id: "research_boundary",
      status: "passed",
      message: "Request is inside the research-support product boundary."
    });
  }

  const body = {
    product_name: PRODUCT_NAME,
    status,
    user_class: normalizedUserClass,
    intended_use: normalizedIntendedUse,
    requested_action_ceiling: requestedActionCeiling,
    effective_action_ceiling: effectiveActionCeiling,
    ceiling_was_capped: effectiveActionCeiling !== requestedActionCeiling,
    positioning: PRODUCT_POSITIONING,
    disclosures: RISK_DISCLOSURES,
    prohibited_claims: PROHIBITED_CLAIMS,
    matches,
    controls,
    can_answer_as_research: status !== "blocked",
    can_escalate_to_paper:
      status === "allowed" && ACTION_RANK.get(effectiveActionCeiling)! >= ACTION_RANK.get("paper_trade_candidate")!
  };

  return {
    id: makeId("pol", { ...body, hash: stableHash(body) }),
    ...body
  };
}

export function productPolicySnapshot() {
  return {
    product_name: PRODUCT_NAME,
    positioning: PRODUCT_POSITIONING,
    allowed_action_classes: [
      "no_trade",
      "research_needed",
      "watchlist",
      "paper_trade_candidate"
    ],
    excluded_action_classes: ["order_ticket_candidate"],
    user_classes: USER_CLASSES,
    intended_uses: INTENDED_USES,
    disclosures: RISK_DISCLOSURES,
    prohibited_claims: PROHIBITED_CLAIMS,
    policy_patterns: POLICY_PATTERNS.map(({ pattern, capTo, ...rule }) => ({
      ...rule,
      cap_to: capTo
    }))
  };
}
