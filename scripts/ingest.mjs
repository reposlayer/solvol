#!/usr/bin/env node
/**
 * Trigger source ingestion once.
 * Env:
 * - INGEST_URL or SNAPSHOT_URL (default http://127.0.0.1:3000)
 * - SOLVOL_INGEST_SECRET, CRON_SECRET, or SNAPSHOT_CRON_SECRET
 * - INGEST_LIMIT optional, default server-side limit
 */

const base = process.env.INGEST_URL ?? process.env.SNAPSHOT_URL ?? "http://127.0.0.1:3000";
const secret = process.env.SOLVOL_INGEST_SECRET ?? process.env.CRON_SECRET ?? process.env.SNAPSHOT_CRON_SECRET;
const limit = process.env.INGEST_LIMIT;

if (!secret) {
  console.error("Set SOLVOL_INGEST_SECRET, CRON_SECRET, or SNAPSHOT_CRON_SECRET");
  process.exit(1);
}

const url = new URL(`${base.replace(/\/$/, "")}/api/internal/ingest`);
if (limit) url.searchParams.set("limit", limit);

const res = await fetch(url, {
  method: "POST",
  headers: { Authorization: `Bearer ${secret}` },
});
const text = await res.text();
console.log(new Date().toISOString(), res.status, text.slice(0, 1000));
if (!res.ok) process.exit(1);
