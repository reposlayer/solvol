"use client";

import { Suspense } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SignalFlowWorkspace } from "@/components/terminal/SignalFlowWorkspace";
import { useTerminal } from "@/components/terminal/terminal-context";
import { marketFocusHref } from "@/components/terminal/terminal-url";

function SignalWorkspaceFallback() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-[var(--terminal-bg)] px-4 py-10 text-center">
      <div>
        <div className="mx-auto mb-3 h-2 w-28 overflow-hidden rounded-full bg-[var(--terminal-panel-hi)]">
          <div className="h-full w-1/2 animate-pulse bg-[var(--terminal-cyan)]" />
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[var(--terminal-muted)]">
          Building signal flow
        </p>
      </div>
    </div>
  );
}

export function WhyMoveWorkspace() {
  const router = useRouter();
  const pathname = usePathname();
  const marketMatch = pathname.match(/^\/market\/([^/]+)/);
  const routeMarketId = marketMatch?.[1];
  const { marketId, setMarketId } = useTerminal();
  const focusedId = routeMarketId ?? (marketId && /^\d{3,}$/.test(marketId) ? marketId : "540816");

  function pickMarket(id: string) {
    setMarketId(id);
    if (pathname === "/terminal") {
      router.replace(marketFocusHref(window.location.search, id), { scroll: false });
      return;
    }
    router.push(marketFocusHref("", id), { scroll: false });
  }

  return (
    <Suspense fallback={<SignalWorkspaceFallback />}>
      <SignalFlowWorkspace focusedId={focusedId} onSelectMarket={pickMarket} />
    </Suspense>
  );
}
