"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams, useParams } from "next/navigation";
import { useTerminal } from "@/components/terminal/terminal-context";

function marketIdFromRoute(
  pathname: string | null,
  params: ReturnType<typeof useParams>,
  searchParams: ReturnType<typeof useSearchParams>,
): string | null {
  const fromQuery = searchParams.get("marketId");
  if (fromQuery && /^\d+$/.test(fromQuery.trim())) return fromQuery.trim();
  if (pathname?.startsWith("/market/")) {
    const p = params.id;
    const id = typeof p === "string" ? p : Array.isArray(p) ? p[0] : null;
    if (id && /^\d+$/.test(id)) return id;
  }
  return null;
}

/** Syncs `marketId` / `autoExplain` query params with terminal context (shareable URLs). */
export function TerminalUrlSync() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const params = useParams();
  const router = useRouter();
  const { setMarketId, runExplainWithId } = useTerminal();
  const autoSessionKey = useRef<string | null>(null);

  useEffect(() => {
    const id = marketIdFromRoute(pathname, params, searchParams);
    if (id) setMarketId(id);
  }, [pathname, params, searchParams, setMarketId]);

  useEffect(() => {
    if (searchParams.get("autoExplain") !== "1") {
      autoSessionKey.current = null;
      return;
    }

    const id = marketIdFromRoute(pathname, params, searchParams);
    if (!id) return;

    const sessionKey = `${pathname ?? ""}?auto=1&${id}`;
    if (autoSessionKey.current === sessionKey) return;
    autoSessionKey.current = sessionKey;

    void runExplainWithId(id).finally(() => {
      const next = new URLSearchParams(searchParams.toString());
      next.delete("autoExplain");
      const qs = next.toString();
      const base = pathname ?? "/terminal";
      router.replace(qs ? `${base}?${qs}` : base, { scroll: false });
    });
  }, [pathname, params, searchParams, router, runExplainWithId]);

  return null;
}
