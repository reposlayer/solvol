const SAFE_EXTERNAL_PROTOCOLS = new Set(["http:", "https:"]);

export function normalizeExternalUrl(raw: string | null | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    if (!SAFE_EXTERNAL_PROTOCOLS.has(url.protocol)) return undefined;

    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|mc_cid$|mc_eid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.hash = "";
    url.pathname = url.pathname.replace(/\/amp\/?$/i, "");
    return url.toString();
  } catch {
    return undefined;
  }
}
