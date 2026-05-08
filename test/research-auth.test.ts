import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PLAN_LIMITS } from "../src/lib/research/types.ts";

test("research plan limits include a generous beta tier below pro", () => {
  assert.ok("beta" in PLAN_LIMITS);
  assert.ok(PLAN_LIMITS.beta.catalystRunsPerDay > PLAN_LIMITS.free.catalystRunsPerDay);
  assert.ok(PLAN_LIMITS.beta.catalystRunsPerDay < PLAN_LIMITS.pro.catalystRunsPerDay);
  assert.ok(PLAN_LIMITS.beta.alerts > PLAN_LIMITS.free.alerts);
  assert.ok(PLAN_LIMITS.beta.alerts < PLAN_LIMITS.pro.alerts);
});

test("research session payload reports auth and beta access status", async () => {
  const types = await readFile("src/lib/research/types.ts", "utf8");
  assert.match(types, /authenticated:\s*boolean/);
  assert.match(types, /accessStatus:\s*BetaAccessStatus/);
});

test("demo fallback is disabled when auth is required", async () => {
  const store = await readFile("src/lib/research/supabase.ts", "utf8");
  assert.match(store, /SUPABASE_REQUIRE_AUTH/);
  assert.match(store, /Authentication required/);
  assert.match(store, /isDemo:\s*!authRequired/);
});

test("service role keys are not referenced from client components", async () => {
  const clientFiles = [
    "src/lib/supabase/client.ts",
    "src/components/terminal/TerminalShell.tsx",
    "src/components/terminal/terminal-context.tsx",
  ];

  for (const file of clientFiles) {
    const source = await readFile(file, "utf8");
    assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|SUPABASE_SERVICE_KEY/);
  }
});

test("supabase schema keeps Data API grants explicit and server-only", async () => {
  const schema = await readFile("supabase/schema.sql", "utf8");

  for (const table of ["teams", "subscriptions", "profiles", "delivery_outbox", "raw_document"]) {
    assert.match(schema, new RegExp(`alter table public\\.${table} enable row level security`));
  }

  assert.match(schema, /grant usage on schema public to service_role/);
  assert.match(schema, /grant select, insert, update, delete on table[\s\S]+to service_role/);
  assert.doesNotMatch(schema, /grant select, insert, update, delete on table[\s\S]+to anon/);
  assert.doesNotMatch(schema, /grant select, insert, update, delete on table[\s\S]+to authenticated/);
  assert.match(schema, /alter default privileges for role postgres in schema public[\s\S]+to service_role/);
  assert.match(schema, /create policy "news item service readable" on public\.news_item for select to service_role/);
  assert.match(schema, /drop policy if exists "news item readable" on public\.news_item/);
  assert.doesNotMatch(schema, /create policy "news item readable" on public\.news_item for select using \(true\)/);
});
