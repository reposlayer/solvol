#!/usr/bin/env node
/**
 * POST /api/internal/snapshot on an interval (cron-friendly) or once if POLL_INTERVAL_MS unset.
 * Env: SNAPSHOT_CRON_SECRET (required), SNAPSHOT_URL (default http://127.0.0.1:3000), POLL_INTERVAL_MS (optional loop).
 */

const base = process.env.SNAPSHOT_URL ?? "http://127.0.0.1:3000";
const secret = process.env.SNAPSHOT_CRON_SECRET;
const intervalMs = process.env.POLL_INTERVAL_MS
  ? Number.parseInt(process.env.POLL_INTERVAL_MS, 10)
  : 0;

if (!secret) {
  console.error("Set SNAPSHOT_CRON_SECRET");
  process.exit(1);
}

async function once() {
  const res = await fetch(`${base.replace(/\/$/, "")}/api/internal/snapshot`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });
  const text = await res.text();
  console.log(new Date().toISOString(), res.status, text.slice(0, 500));
  if (!res.ok) process.exitCode = 1;
}

if (Number.isFinite(intervalMs) && intervalMs > 0) {
  for (;;) {
    try {
      await once();
    } catch (e) {
      console.error(e);
      process.exitCode = 1;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
} else {
  once().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
