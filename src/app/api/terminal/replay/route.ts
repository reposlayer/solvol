import {
  createSupabaseRawPayloadStore,
  supabaseRawPayloadStoreConfigFromEnv,
} from "@/lib/terminal/raw-store";
import { replayRawPayloadsFromStore } from "@/lib/terminal/replay";

export const runtime = "nodejs";

const MAX_REPLAY_KEYS = 25;
const RAW_BLOB_KEY_RE = /^raw\/[A-Za-z0-9._-]+\/\d{4}-\d{2}-\d{2}\/[a-f0-9]{64}\.json$/;

function rawBlobKeysFromUrl(request: Request): string[] {
  const url = new URL(request.url);
  return url.searchParams
    .getAll("rawBlobKey")
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function isReplayableRawBlobKey(value: string): boolean {
  return value.length <= 512 && RAW_BLOB_KEY_RE.test(value) && !value.includes("..");
}

export async function GET(request: Request) {
  const rawBlobKeys = [...new Set(rawBlobKeysFromUrl(request))].slice(0, MAX_REPLAY_KEYS);
  if (rawBlobKeys.length === 0) {
    return Response.json({
      readOnly: true,
      error: "rawBlobKey query parameter is required",
    }, { status: 400 });
  }

  const invalidKeys = rawBlobKeys.filter((key) => !isReplayableRawBlobKey(key));
  if (invalidKeys.length > 0) {
    return Response.json({
      readOnly: true,
      error: "rawBlobKey must point at an immutable terminal raw JSON object",
      invalidCount: invalidKeys.length,
    }, { status: 400 });
  }

  const config = supabaseRawPayloadStoreConfigFromEnv();
  if (!config) {
    return Response.json({
      readOnly: true,
      error: "Raw payload replay requires durable raw storage configuration",
    }, { status: 503 });
  }

  const replay = await replayRawPayloadsFromStore({
    rawBlobKeys,
    rawStore: createSupabaseRawPayloadStore(config),
  });

  return Response.json({
    ...replay,
    readOnly: true,
  });
}
