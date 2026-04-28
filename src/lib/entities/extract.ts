import type { ExtractedEntities } from "@/lib/domain/types";

type OpenAIChatResponse = {
  choices?: { message?: { content?: string | null } }[];
};

function heuristicExtract(title: string, description: string): ExtractedEntities {
  const text = `${title}\n${description}`;
  const tickers = new Set<string>();
  const tickerRe = /\b(BTC|ETH|SOL|XRP|DOGE|SPY|QQQ)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = tickerRe.exec(text)) !== null) {
    tickers.add(m[1]!.toUpperCase());
  }

  const money = title.match(/\$[\d,.]+[kKmM]?/g) ?? [];
  const years = title.match(/\b20[23]\d\b/g) ?? [];

  const words = title
    .replace(/[?$]/g, "")
    .split(/\s+/)
    .filter((w) => w.length > 2);

  const relatedTerms = [
    ...money,
    ...years,
    ...Array.from(tickers),
    ...words.slice(0, 6),
  ].slice(0, 12);

  let categoryGuess = "general";
  const lower = text.toLowerCase();
  if (/\b(bitcoin|btc|ethereum|eth|solana|sol|crypto)\b/.test(lower)) {
    categoryGuess = "crypto";
  } else if (/\b(trump|biden|election|poll|senate|house|president)\b/.test(lower)) {
    categoryGuess = "politics";
  } else if (/\b(nfl|nba|mlb|uefa|world cup|game \d+)\b/.test(lower)) {
    categoryGuess = "sports";
  } else if (/\b(cpi|fomc|fed|jobs report|treasury|yield)\b/.test(lower)) {
    categoryGuess = "economics";
  }

  return {
    people: [],
    organizations: [],
    tickers: Array.from(tickers),
    dates: [...years],
    topics: words.slice(0, 8),
    relatedTerms,
    categoryGuess,
  };
}

async function extractWithOpenAI(title: string, description: string): Promise<ExtractedEntities | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const body = {
    model: "gpt-4o-mini",
    temperature: 0.1,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system" as const,
        content:
          "Extract structured entities for a prediction market. Return JSON only with keys: people (string[]), organizations (string[]), tickers (string[] like BTC), dates (string[]), topics (string[]), relatedTerms (string[] search queries), categoryGuess (one of: crypto, politics, sports, economics, culture, general).",
      },
      {
        role: "user" as const,
        content: `Title: ${title}\n\nDescription:\n${description.slice(0, 6000)}`,
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as OpenAIChatResponse;
  const raw = data.choices?.[0]?.message?.content;
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<ExtractedEntities>;
    return {
      people: Array.isArray(parsed.people) ? parsed.people.filter(Boolean).map(String) : [],
      organizations: Array.isArray(parsed.organizations)
        ? parsed.organizations.filter(Boolean).map(String)
        : [],
      tickers: Array.isArray(parsed.tickers) ? parsed.tickers.filter(Boolean).map(String) : [],
      dates: Array.isArray(parsed.dates) ? parsed.dates.filter(Boolean).map(String) : [],
      topics: Array.isArray(parsed.topics) ? parsed.topics.filter(Boolean).map(String) : [],
      relatedTerms: Array.isArray(parsed.relatedTerms)
        ? parsed.relatedTerms.filter(Boolean).map(String)
        : [],
      categoryGuess:
        typeof parsed.categoryGuess === "string" ? parsed.categoryGuess : "general",
    };
  } catch {
    return null;
  }
}

export async function extractEntities(title: string, description: string): Promise<ExtractedEntities> {
  const ai = await extractWithOpenAI(title, description);
  if (ai) {
    const h = heuristicExtract(title, description);
    return {
      ...ai,
      tickers: Array.from(new Set([...ai.tickers, ...h.tickers])),
      relatedTerms: Array.from(new Set([...ai.relatedTerms, ...h.relatedTerms])).slice(0, 20),
    };
  }
  return heuristicExtract(title, description);
}
