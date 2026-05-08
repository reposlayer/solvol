import test from "node:test";
import assert from "node:assert/strict";
import {
  compileMarketQueryPack,
  compileMarketQueryPacks,
} from "../src/lib/terminal/query-compiler.ts";

test("market query compiler builds a source-prioritized query pack", () => {
  const pack = compileMarketQueryPack({
    marketId: "starship-june",
    question: "Will SpaceX launch Starship before June 30?",
    description: "Resolves Yes if SpaceX conducts a Starship test flight before June 30.",
    category: "Science",
  });

  assert.equal(pack.marketId, "starship-june");
  assert.ok(pack.queries.includes("SpaceX Starship launch June 30"));
  assert.ok(pack.queries.includes("Starship FAA license"));
  assert.ok(pack.queries.includes("SpaceX launch license"));
  assert.ok(pack.queries.includes("Starship test flight"));
  assert.ok(pack.queries.includes("FAA SpaceX launch approval"));
  assert.deepEqual(pack.entities.map((entity) => entity.name), ["SpaceX", "Starship", "FAA"]);
  assert.deepEqual(pack.dateConstraints.map((date) => date.text), ["before June 30"]);
  assert.deepEqual(pack.sourcePriorities.slice(0, 4).map((source) => source.label), [
    "FAA",
    "SpaceX official",
    "GDELT",
    "NASA/space sources",
  ]);
  assert.equal(pack.sourcePriorities[0]?.sourceId, undefined);
  assert.ok(pack.gdeltTerms.includes("SpaceX"));
  assert.ok(pack.gdeltTerms.includes("Starship"));
});

test("market query compiler is deterministic and bounded across markets", () => {
  const packs = compileMarketQueryPacks([
    {
      marketId: "fed-cut",
      question: "Will the Federal Reserve cut rates before July 2026?",
      description: "Resolves based on FOMC official statements.",
      category: "Macro",
    },
    {
      marketId: "btc-etf",
      question: "Will a Bitcoin ETF be approved by the SEC in 2026?",
      description: "Approval source is SEC filing or official statement.",
      category: "Crypto",
    },
  ]);

  assert.deepEqual(packs.map((pack) => pack.marketId), ["fed-cut", "btc-etf"]);
  assert.ok(packs.every((pack) => pack.queries.length <= 12));
  assert.ok(packs[0]?.sourcePriorities.some((source) => source.label === "Federal Reserve"));
  assert.ok(packs[1]?.sourcePriorities.some((source) => source.label === "SEC"));
  assert.deepEqual(packs, compileMarketQueryPacks([
    {
      marketId: "fed-cut",
      question: "Will the Federal Reserve cut rates before July 2026?",
      description: "Resolves based on FOMC official statements.",
      category: "Macro",
    },
    {
      marketId: "btc-etf",
      question: "Will a Bitcoin ETF be approved by the SEC in 2026?",
      description: "Approval source is SEC filing or official statement.",
      category: "Crypto",
    },
  ]));
});
