import test from "node:test";
import assert from "node:assert/strict";
import { validateWaitlistInput, waitlistRowFromInput } from "../src/lib/auth/waitlist.ts";

test("validates waitlist submissions with normalized email and trimmed text", () => {
  const parsed = validateWaitlistInput({
    email: "  trader@example.COM ",
    name: "  Research Lead  ",
    useCase: "  Macro event desk  ",
    source: " terminal-login ",
  });

  assert.deepEqual(parsed, {
    ok: true,
    value: {
      email: "trader@example.com",
      name: "Research Lead",
      useCase: "Macro event desk",
      source: "terminal-login",
    },
  });
});

test("rejects malformed waitlist emails", () => {
  assert.deepEqual(validateWaitlistInput({ email: "bad" }), {
    ok: false,
    error: "Enter a valid email address.",
  });
});

test("maps waitlist submissions to an idempotent Supabase row", () => {
  const row = waitlistRowFromInput({
    email: "trader@example.com",
    name: "Research Lead",
    useCase: "Macro event desk",
    source: "terminal-login",
  });

  assert.deepEqual(row, {
    email: "trader@example.com",
    name: "Research Lead",
    use_case: "Macro event desk",
    source: "terminal-login",
    status: "pending",
    updated_at: row.updated_at,
  });
  assert.match(row.updated_at, /^\d{4}-\d{2}-\d{2}T/);
});
