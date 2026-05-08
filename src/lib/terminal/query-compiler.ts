export type MarketQueryPackInput = {
  marketId: string;
  question: string;
  description?: string | null;
  category?: string | null;
};

export type QueryEntity = {
  name: string;
  kind: "org" | "product" | "regulator" | "token" | "topic";
};

export type QueryDateConstraint = {
  text: string;
  operator: "before" | "after" | "by" | "during";
  value: string;
};

export type QuerySourcePriority = {
  label: string;
  sourceId?: string;
  priority: number;
  reason: string;
};

export type MarketQueryPack = {
  marketId: string;
  question: string;
  queries: string[];
  entities: QueryEntity[];
  dateConstraints: QueryDateConstraint[];
  sourcePriorities: QuerySourcePriority[];
  gdeltTerms: string[];
};

const STOP_WORDS = new Set([
  "will",
  "the",
  "before",
  "after",
  "above",
  "below",
  "during",
  "with",
  "from",
  "this",
  "that",
  "market",
  "resolve",
  "resolves",
  "based",
  "yes",
  "no",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

const ENTITY_RULES: Array<{ rx: RegExp; entity: QueryEntity }> = [
  { rx: /\bspacex\b/i, entity: { name: "SpaceX", kind: "org" } },
  { rx: /\bstarship\b/i, entity: { name: "Starship", kind: "product" } },
  { rx: /\bfaa\b|\bfederal aviation administration\b/i, entity: { name: "FAA", kind: "regulator" } },
  { rx: /\bfederal reserve\b|\bfomc\b|\bfed\b/i, entity: { name: "Federal Reserve", kind: "regulator" } },
  { rx: /\bsec\b|\bsecurities and exchange commission\b/i, entity: { name: "SEC", kind: "regulator" } },
  { rx: /\bbitcoin\b|\bbtc\b/i, entity: { name: "Bitcoin", kind: "token" } },
  { rx: /\bethereum\b|\beth\b/i, entity: { name: "Ethereum", kind: "token" } },
  { rx: /\bnasa\b/i, entity: { name: "NASA", kind: "regulator" } },
  { rx: /\bcisa\b/i, entity: { name: "CISA", kind: "regulator" } },
  { rx: /\busgs\b/i, entity: { name: "USGS", kind: "regulator" } },
];

function unique<T>(items: T[], key = (item: T) => String(item)): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const itemKey = key(item);
    if (seen.has(itemKey)) continue;
    seen.add(itemKey);
    out.push(item);
  }
  return out;
}

function cleanQuestion(question: string): string {
  return question
    .replace(/[“”"]/g, "")
    .replace(/[?!.]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function titleWords(question: string): string[] {
  return question
    .replace(/[^\p{L}\p{N}\s$-]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word.toLowerCase()));
}

function compileEntities(text: string): QueryEntity[] {
  const matched = ENTITY_RULES
    .filter((rule) => rule.rx.test(text))
    .map((rule) => rule.entity);
  if (/\bspacex\b/i.test(text) && /\bstarship\b|\blaunch\b/i.test(text) && !matched.some((entity) => entity.name === "FAA")) {
    matched.push({ name: "FAA", kind: "regulator" });
  }
  const fallback = titleWords(text)
    .filter((word) => /^[A-Z][A-Za-z0-9-]+$/.test(word))
    .map((word): QueryEntity => ({ name: word, kind: "topic" }));
  return unique([...matched, ...fallback], (entity) => entity.name).slice(0, 8);
}

function compileDateConstraints(question: string): QueryDateConstraint[] {
  const constraints: QueryDateConstraint[] = [];
  const before = /\bbefore\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*20\d{2})?|\w+\s+\d{1,2})/i.exec(question);
  if (before) {
    constraints.push({
      text: `before ${before[1]}`,
      operator: "before",
      value: before[1]!,
    });
  }
  const by = /\bby\s+([A-Z][a-z]+\s+\d{1,2}(?:,\s*20\d{2})?|20\d{2})/i.exec(question);
  if (by) {
    constraints.push({
      text: `by ${by[1]}`,
      operator: "by",
      value: by[1]!,
    });
  }
  return unique(constraints, (constraint) => constraint.text);
}

function compileSourcePriorities(text: string, entities: QueryEntity[], category?: string | null): QuerySourcePriority[] {
  const labels = new Set(entities.map((entity) => entity.name));
  const lower = `${text} ${category ?? ""}`.toLowerCase();
  const priorities: QuerySourcePriority[] = [];

  if (labels.has("FAA") || lower.includes("launch") || lower.includes("starship")) {
    priorities.push(
      { label: "FAA", priority: 1, reason: "Launch/license resolution authority." },
      { label: "SpaceX official", priority: 2, reason: "Primary company source for launch timing." },
      { label: "GDELT", sourceId: "gdelt-doc", priority: 3, reason: "Broad news recall for space launch coverage." },
      { label: "NASA/space sources", priority: 4, reason: "Secondary space-domain corroboration." },
    );
  }
  if (labels.has("Federal Reserve")) {
    priorities.push(
      { label: "Federal Reserve", sourceId: "federal-reserve-rss", priority: 1, reason: "Official macro policy source." },
      { label: "GDELT", sourceId: "gdelt-doc", priority: 2, reason: "Broad news recall for macro coverage." },
    );
  }
  if (labels.has("SEC")) {
    priorities.push(
      { label: "SEC", sourceId: "sec-rss", priority: 1, reason: "Official filings and approval source." },
      { label: "GDELT", sourceId: "gdelt-doc", priority: 2, reason: "Broad news recall for securities coverage." },
    );
  }
  if (labels.has("Bitcoin") || labels.has("Ethereum") || lower.includes("crypto")) {
    priorities.push(
      { label: "Ethereum JSON-RPC", sourceId: "ethereum-json-rpc", priority: 2, reason: "Raw replayable on-chain context." },
      { label: "CoinGecko", sourceId: "coingecko-context", priority: 3, reason: "Public crypto market context." },
    );
  }
  priorities.push({ label: "GDELT", sourceId: "gdelt-doc", priority: 10, reason: "Default broad open-news recall." });

  return unique(priorities, (priority) => priority.label)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 8);
}

function queryJoin(parts: Array<string | undefined>): string {
  return parts
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function compileQueries(question: string, entities: QueryEntity[], dates: QueryDateConstraint[]): string[] {
  const words = titleWords(question);
  const names = entities.map((entity) => entity.name);
  const date = dates[0]?.value;
  const primary = names.slice(0, 2);
  const queries = [
    queryJoin([...primary, words.includes("launch") ? "launch" : words[0], date]),
  ];

  if (names.includes("SpaceX") && names.includes("Starship")) {
    queries.push(
      "Starship FAA license",
      "SpaceX launch license",
      "Starship test flight",
      "FAA SpaceX launch approval",
    );
  }
  if (names.includes("Federal Reserve")) {
    queries.push("Federal Reserve rate cut", "FOMC statement", queryJoin(["Federal Reserve", date]));
  }
  if (names.includes("SEC")) {
    queries.push("SEC approval", "SEC filing", queryJoin([names.find((name) => name !== "SEC"), "SEC approval", date]));
  }

  return unique([
    ...queries,
    queryJoin(words.slice(0, 5)),
  ].filter(Boolean)).slice(0, 12);
}

export function compileMarketQueryPack(input: MarketQueryPackInput): MarketQueryPack {
  const question = cleanQuestion(input.question);
  const text = `${question} ${input.description ?? ""}`;
  const entities = compileEntities(text);
  const dateConstraints = compileDateConstraints(question);
  const queries = compileQueries(question, entities, dateConstraints);
  const sourcePriorities = compileSourcePriorities(text, entities, input.category);
  const gdeltTerms = unique([
    ...entities.map((entity) => entity.name),
    ...queries.flatMap((query) => query.split(/\s+/)).filter((term) => term.length > 2),
  ]).slice(0, 24);

  return {
    marketId: input.marketId,
    question,
    queries,
    entities,
    dateConstraints,
    sourcePriorities,
    gdeltTerms,
  };
}

export function compileMarketQueryPacks(inputs: MarketQueryPackInput[]): MarketQueryPack[] {
  return inputs.map(compileMarketQueryPack);
}
