/** Gamma returns `clobTokenIds` as a JSON-encoded string or as a string[]. */
export function parseClobTokenIds(raw: unknown): string[] {
  if (Array.isArray(raw) && raw.every((x) => typeof x === "string")) {
    return raw;
  }
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
        return parsed;
      }
    } catch {
      return [];
    }
  }
  return [];
}

/** Index 0 = YES outcome token for standard binary markets. */
export function yesTokenId(raw: unknown): string | null {
  const ids = parseClobTokenIds(raw);
  return ids[0] ?? null;
}

/** Index 1 = NO outcome token for standard binary markets. */
export function noTokenId(raw: unknown): string | null {
  const ids = parseClobTokenIds(raw);
  return ids[1] ?? null;
}
