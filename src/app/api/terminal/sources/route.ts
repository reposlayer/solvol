import { fetchTerminalSourceHealthSnapshot } from "@/lib/terminal/source-health";
import type { DataSourceStatus } from "@/lib/terminal/types";

export const runtime = "nodejs";

function publicSourceHealth(status: DataSourceStatus): DataSourceStatus {
  const safe = { ...status };
  delete safe.lastCursor;
  delete safe.lastError;
  delete safe.lastHttpStatus;
  delete safe.rateLimitRemaining;
  delete safe.rateLimitResetAt;
  return safe;
}

export async function GET() {
  const snapshot = await fetchTerminalSourceHealthSnapshot();

  return Response.json({
    readOnly: true,
    fetchedAt: snapshot.checkedAt,
    mode: snapshot.mode,
    registry: snapshot.registry,
    sourceHealth: snapshot.sourceHealth.map(publicSourceHealth),
    error: snapshot.error,
    provenanceFields: [
      "sourceId",
      "sourceClass",
      "externalId",
      "sourceUrl",
      "fetchedAt",
      "publishedAt",
      "rawBlobKey",
      "checksumSha256",
      "adapterVersion",
    ],
  });
}
