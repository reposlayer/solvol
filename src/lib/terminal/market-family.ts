import type {
  MarketFamily,
  MarketFamilyClassification,
  WhyMovedDirection,
} from "./types";

type MarketFamilyInput = {
  question: string;
  description?: string | null;
  category?: string | null;
  resolutionRules?: string | null;
  event?: string | null;
};

type DirectionInput = {
  classification: MarketFamilyClassification;
  eventText: string;
  fallbackDirection: WhyMovedDirection;
};

type DirectionResult = {
  direction: WhyMovedDirection;
  reason: string;
  ruleId: `why:market_family:${MarketFamily}`;
};

type FamilyRule = {
  family: MarketFamily;
  label: string;
  confidence: number;
  terms: readonly string[];
  rx: RegExp;
};

const FAMILY_RULES: readonly FamilyRule[] = [
  {
    family: "enforcement",
    label: "Enforcement",
    confidence: 0.9,
    terms: ["enforcement", "complaint", "lawsuit", "sanction", "fine", "investigation", "order issued"],
    rx: /\benforcement|complaint|lawsuit|sanction|fine|investigation|order issued\b/,
  },
  {
    family: "election",
    label: "Election",
    confidence: 0.86,
    terms: ["election", "candidate", "ballot", "delegate", "nomination", "certified"],
    rx: /\belection|nomination|candidate|ballot|delegate|certified|wins?\b/,
  },
  {
    family: "approval",
    label: "Approval",
    confidence: 0.88,
    terms: ["approve", "approval", "approved", "denied", "blocked", "signed", "certified", "reject"],
    rx: /\bapprove|approved|approval|denied|blocked|signed|certified|reject|rejected\b/,
  },
  {
    family: "onchain",
    label: "On-Chain",
    confidence: 0.82,
    terms: ["transfer", "bridge", "deposit", "contract", "governance", "onchain", "on-chain", "token"],
    rx: /\btransfer|bridge|deposits?|contract|governance|onchain|on-chain|token\b/,
  },
  {
    family: "price_threshold",
    label: "Price Threshold",
    confidence: 0.86,
    terms: ["above", "below", "over", "under", "exceed", "less than", "at least", "price"],
    rx: /\b(above|below|over|under|exceed|exceeds|less than|greater than|at least|price|usd|\$|%)\b/,
  },
  {
    family: "filing",
    label: "Filing",
    confidence: 0.82,
    terms: ["8-k", "10-k", "10-q", "s-1", "filing", "sec"],
    rx: /\b8-k|8 k|10-k|10 k|10-q|10 q|s-1|s 1|filing|sec\b/,
  },
  {
    family: "weather",
    label: "Weather",
    confidence: 0.78,
    terms: ["hurricane", "storm", "temperature", "rainfall", "earthquake", "usgs"],
    rx: /\bhurricane|storm|temperature|rainfall|earthquake|wildfire|usgs\b/,
  },
  {
    family: "sports",
    label: "Sports",
    confidence: 0.74,
    terms: ["game", "match", "championship", "season", "team", "score"],
    rx: /\bgame|match|championship|season|team|score|playoff|final\b/,
  },
];

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9$%.\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function matchedTerms(rule: FamilyRule, text: string): string[] {
  return rule.terms.filter((term) => text.includes(term));
}

export function classifyMarketFamily(input: MarketFamilyInput): MarketFamilyClassification {
  const text = normalizeText([
    input.question,
    input.description ?? "",
    input.resolutionRules ?? "",
    input.event ?? "",
    input.category ?? "",
  ].join(" "));
  const rule = FAMILY_RULES.find((item) => item.rx.test(text));
  if (!rule) {
    return {
      family: "generic",
      label: "Generic",
      confidence: 0.5,
      ruleId: "market_family:generic",
      matchedTerms: [],
    };
  }
  return {
    family: rule.family,
    label: rule.label,
    confidence: rule.confidence,
    ruleId: `market_family:${rule.family}`,
    matchedTerms: matchedTerms(rule, text),
  };
}

export function inferMarketFamilyDirection(input: DirectionInput): DirectionResult {
  const eventText = normalizeText(input.eventText);
  const family = input.classification.family;
  const ruleId = `why:market_family:${family}` as const;

  if (family === "approval") {
    if (/\bdeny|denied|blocked|reject|rejected\b/.test(eventText)) {
      return { direction: "no", reason: "direction:approval_no", ruleId };
    }
    if (/\bapprove|approved|approval|signed|certified\b/.test(eventText)) {
      return { direction: "yes", reason: "direction:approval_yes", ruleId };
    }
  }

  if (family === "price_threshold") {
    if (/\babove|over|exceed|exceeds|greater than|at least|new high\b/.test(eventText)) {
      return { direction: "yes", reason: "direction:price_threshold_yes", ruleId };
    }
    if (/\bbelow|under|less than|falls?|drops?|lower\b/.test(eventText)) {
      return { direction: "no", reason: "direction:price_threshold_no", ruleId };
    }
  }

  if (family === "generic") {
    return { direction: "unclear", reason: "direction:unclear", ruleId };
  }

  return {
    direction: input.fallbackDirection,
    reason: `direction:${family}_${input.fallbackDirection}`,
    ruleId,
  };
}
