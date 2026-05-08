import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildAuthRedirect,
  isProtectedApiPath,
  isProtectedPagePath,
  normalizeInviteEmail,
  planAllowsBetaAccess,
} from "../src/lib/auth/beta-access.ts";

test("normalizes beta invite emails for stable lookups", () => {
  assert.equal(normalizeInviteEmail("  Founder@Solvol.COM "), "founder@solvol.com");
  assert.equal(normalizeInviteEmail("not-an-email"), null);
  assert.equal(normalizeInviteEmail(""), null);
});

test("protects beta product pages while leaving login and waitlist public", () => {
  assert.equal(isProtectedPagePath("/terminal"), true);
  assert.equal(isProtectedPagePath("/terminal?lane=hot"), true);
  assert.equal(isProtectedPagePath("/market/540816"), true);
  assert.equal(isProtectedPagePath("/tools/why-move"), true);
  assert.equal(isProtectedPagePath("/login"), false);
  assert.equal(isProtectedPagePath("/waitlist"), false);
});

test("protects market intelligence and research APIs but not waitlist or cron callbacks", () => {
  assert.equal(isProtectedApiPath("/api/research/session"), true);
  assert.equal(isProtectedApiPath("/api/explain"), true);
  assert.equal(isProtectedApiPath("/api/discovery"), true);
  assert.equal(isProtectedApiPath("/api/market/540816/intel"), true);
  assert.equal(isProtectedApiPath("/api/terminal/stream"), true);
  assert.equal(isProtectedApiPath("/api/terminal/replay"), true);
  assert.equal(isProtectedApiPath("/api/terminal/sources"), true);
  assert.equal(isProtectedApiPath("/api/waitlist"), false);
  assert.equal(isProtectedApiPath("/api/internal/ingest"), false);
});

test("protected service-role APIs fail closed when Supabase auth client is missing", async () => {
  const source = await readFile("src/lib/supabase/proxy.ts", "utf8");
  assert.match(source, /serviceConfigured/);
  assert.match(source, /protectedApiHasServiceRole/);
  assert.match(source, /auth_not_configured/);
  assert.match(source, /Supabase auth is not configured/);
});

test("allows beta and paid plans into the private product", () => {
  assert.equal(planAllowsBetaAccess("free"), false);
  assert.equal(planAllowsBetaAccess("beta"), true);
  assert.equal(planAllowsBetaAccess("pro"), true);
  assert.equal(planAllowsBetaAccess("team"), true);
});

test("builds a safe login redirect that preserves product return paths", () => {
  assert.equal(
    buildAuthRedirect("https://solvol.local/terminal?lane=hot"),
    "/login?next=%2Fterminal%3Flane%3Dhot",
  );
  assert.equal(buildAuthRedirect("https://solvol.local/https://evil.example"), "/login");
});

test("accepted invites create beta profiles and mark invite acceptance", async () => {
  const source = await readFile("src/lib/auth/beta-access.ts", "utf8");
  assert.match(source, /plan,\s*$/m);
  assert.match(source, /:\s*"beta"/);
  assert.match(source, /status:\s*"accepted"/);
  assert.match(source, /accepted_by:\s*input\.id/);
});
