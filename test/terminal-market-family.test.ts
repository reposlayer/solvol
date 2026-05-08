import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyMarketFamily,
  inferMarketFamilyDirection,
} from "../src/lib/terminal/market-family.ts";

test("market family classifier labels core Polymarket question families", () => {
  assert.equal(classifyMarketFamily({
    question: "Will a Bitcoin ETF be approved by the SEC in 2026?",
    description: "Resolves Yes if the SEC approves the filing.",
    category: "Crypto",
  }).family, "approval");

  assert.equal(classifyMarketFamily({
    question: "Will Bitcoin be above $100,000 on December 31?",
    description: "Resolves from the BTC USD reference price.",
    category: "Crypto",
  }).family, "price_threshold");

  assert.equal(classifyMarketFamily({
    question: "Will the SEC file an enforcement complaint against Example Corp?",
    description: "Resolves Yes if an official enforcement action is filed.",
    category: "Business",
  }).family, "enforcement");

  assert.equal(classifyMarketFamily({
    question: "Will the leading candidate win the national election?",
    description: "Resolves from certified election results.",
    category: "Politics",
  }).family, "election");

  assert.equal(classifyMarketFamily({
    question: "Will Ethereum bridge deposits exceed $1B this month?",
    description: "Resolves from public on-chain bridge activity.",
    category: "Crypto",
  }).family, "onchain");
});

test("market family direction inference keeps family-specific rule ids", () => {
  const approval = classifyMarketFamily({
    question: "Will a Bitcoin ETF be approved by the SEC in 2026?",
    description: "Resolves Yes if the SEC approves the filing.",
    category: "Crypto",
  });

  assert.deepEqual(inferMarketFamilyDirection({
    classification: approval,
    eventText: "SEC denied the Bitcoin ETF application.",
    fallbackDirection: "yes",
  }), {
    direction: "no",
    reason: "direction:approval_no",
    ruleId: "why:market_family:approval",
  });

  const threshold = classifyMarketFamily({
    question: "Will Bitcoin be above $100,000 on December 31?",
    description: "Resolves from the BTC USD reference price.",
    category: "Crypto",
  });

  assert.deepEqual(inferMarketFamilyDirection({
    classification: threshold,
    eventText: "Bitcoin price moved above the threshold.",
    fallbackDirection: "unclear",
  }), {
    direction: "yes",
    reason: "direction:price_threshold_yes",
    ruleId: "why:market_family:price_threshold",
  });
});
