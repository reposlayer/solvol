import type { MarketMoveExplanation } from "@/lib/domain/types";

type OpenAIChatResponse = {
  choices?: { message?: { content?: string | null } }[];
};

function templateNarration(ex: MarketMoveExplanation): string {
  const move = ex.move;
  const head = `Market moved ${move.movePercent >= 0 ? "+" : ""}${move.movePercent.toFixed(2)}% (YES implied ${(move.priceBefore * 100).toFixed(1)}¢ → ${(move.priceAfter * 100).toFixed(1)}¢) between ${move.windowStart} and ${move.windowEnd}.`;

  const vol = `Volume vs ~7d daily average is ~${ex.volumeChange.toFixed(2)}×.`;

  if (ex.likelyCatalysts.length === 0) {
    return `${head} ${vol}\n\nNo clear catalyst found in retrieved feeds.\n\nPossible causes:\n${ex.possibleCausesWhenWeak.map((x) => `- ${x}`).join("\n")}`;
  }

  const top = ex.likelyCatalysts[0]!;
  const block = [
    `Most likely catalyst (${top.source}, confidence ${top.confidence}%): ${top.title}`,
    ``,
    `Supporting signals:`,
    ...top.evidence.map((e) => `- ${e}`),
    ``,
    `Confidence: ${ex.confidence}% (${ex.confidenceBand}).`,
  ].join("\n");

  if (ex.crossMarketSummary) {
    return `${head} ${vol}\n\n${block}\n\nCross-market: ${ex.crossMarketSummary}`;
  }

  return `${head} ${vol}\n\n${block}`;
}

async function openAiNarrate(ex: MarketMoveExplanation): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;

  const payload = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      {
        role: "system" as const,
        content:
          "You are a careful prediction-market analyst. Write 4-8 sentences. Use ONLY facts present in the JSON. Never invent sources or timestamps. If catalysts are empty, explain uncertainty and list possible non-news causes provided. Include confidence as a number.",
      },
      {
        role: "user" as const,
        content: JSON.stringify({
          marketTitle: ex.marketTitle,
          move: ex.move,
          volumeChange: ex.volumeChange,
          confidence: ex.confidence,
          confidenceBand: ex.confidenceBand,
          likelyCatalysts: ex.likelyCatalysts,
          possibleCausesWhenWeak: ex.possibleCausesWhenWeak,
          relatedMarkets: ex.relatedMarkets,
          crossMarketSummary: ex.crossMarketSummary,
        }),
      },
    ],
  };

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) return null;
  const data = (await res.json()) as OpenAIChatResponse;
  const text = data.choices?.[0]?.message?.content?.trim();
  return text ?? null;
}

export async function narrateExplanation(ex: MarketMoveExplanation): Promise<string> {
  const ai = await openAiNarrate(ex);
  if (ai) return ai;
  return templateNarration({ ...ex, explanation: "" });
}
