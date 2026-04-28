"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

type NavItem = { label: string; href: string; lane?: string; fkey?: string };

const MARKETS: NavItem[] = [
  { label: "Top Movers", href: "/terminal?lane=hot&limit=60", lane: "hot", fkey: "1" },
  { label: "Research Worthy", href: "/terminal?lane=research_worthy&limit=60", lane: "research_worthy", fkey: "2" },
  { label: "Catalyst Rich", href: "/terminal?lane=catalyst_rich&limit=60", lane: "catalyst_rich", fkey: "3" },
  { label: "Anomalies", href: "/terminal?lane=anomaly&limit=60", lane: "anomaly", fkey: "4" },
  { label: "Resolution Risk", href: "/terminal?lane=deadline_risk&hours=72&limit=60", lane: "deadline_risk", fkey: "5" },
  { label: "Volume Leaders", href: "/terminal?lane=high_volume&limit=60", lane: "high_volume", fkey: "6" },
  { label: "New Listings", href: "/terminal?lane=new&limit=60", lane: "new", fkey: "7" },
];

const CATEGORIES: NavItem[] = [
  { label: "Crypto Tape", href: "/terminal?lane=hot&limit=80" },
  { label: "Politics Flow", href: "/terminal?lane=high_volume&limit=80" },
  { label: "Sports Board", href: "/terminal?lane=high_volume&limit=80" },
  { label: "Macro Watch", href: "/terminal?lane=hot&limit=80" },
  { label: "Culture / AI", href: "/terminal?lane=new&limit=80" },
  { label: "48h Expiries", href: "/terminal?lane=closing_soon&hours=48&limit=80" },
];

const INTEL: NavItem[] = [
  { label: "Market Lens", href: "/terminal#market-lens" },
  { label: "Catalyst Map", href: "/terminal#intelligence" },
  { label: "Flow Alerts", href: "/terminal#flow" },
  { label: "Opportunity Radar", href: "/terminal#radar" },
  { label: "Resolution Queue", href: "/terminal#resolution" },
  { label: "Watchlist", href: "/terminal#watchlist" },
];

function NavSection({
  title,
  items,
  activeLane,
}: {
  title: string;
  items: NavItem[];
  activeLane: string;
}) {
  return (
    <div className="mb-4">
      <div className="mb-1.5 px-2 font-mono text-[9px] font-semibold uppercase tracking-[0.22em] text-[var(--terminal-muted)]">
        {title}
      </div>
      <ul>
        {items.map((item) => {
          const active = item.lane && item.lane === activeLane;
          return (
            <li key={item.href + item.label}>
              <Link
                href={item.href}
                className={`flex items-center justify-between rounded-sm border px-2 py-1.5 font-mono text-[11px] transition-colors ${
                  active
                    ? "border-[var(--terminal-cyan)]/45 bg-[var(--terminal-cyan-soft)]/40 text-[var(--terminal-cyan)]"
                    : "border-transparent text-[var(--terminal-text-2)] hover:border-[var(--terminal-border)] hover:bg-[var(--terminal-panel-2)] hover:text-[var(--terminal-cyan)]"
                }`}
              >
                <span>{item.label}</span>
                {item.fkey ? (
                  <span className="font-mono text-[9px] text-[var(--terminal-muted)]">
                    F{item.fkey}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function TerminalNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeLane = searchParams.get("lane") ?? (pathname === "/terminal" ? "hot" : "");

  return (
    <aside className="flex w-[210px] shrink-0 flex-col border-r border-[var(--terminal-border)] bg-[var(--terminal-panel)] py-2 pl-1.5 pr-1">
      <div className="mb-3 rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5">
        <div className="font-mono text-[9px] uppercase tracking-[0.22em] text-[var(--terminal-muted)]">
          Command Stack
        </div>
        <div className="mt-1 grid grid-cols-2 gap-1 font-mono text-[9.5px] text-[var(--terminal-text-2)]">
          <span>HOT</span>
          <span>VOL</span>
          <span>CLS</span>
          <span>NEW</span>
          <span>MKT id</span>
          <span>WHY id</span>
          <span>WATCH</span>
          <span>MODE</span>
        </div>
      </div>
      <NavSection title="Markets" items={MARKETS} activeLane={activeLane} />
      <NavSection title="Categories" items={CATEGORIES} activeLane={activeLane} />
      <NavSection title="Intelligence" items={INTEL} activeLane={activeLane} />

      <div className="mt-auto rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-2 py-1.5 font-mono text-[9.5px] leading-relaxed text-[var(--terminal-muted)]">
        <div className="mb-0.5 text-[var(--terminal-text-2)]">Terminal thesis</div>
        <div className="opacity-80">Odds + flow + catalysts in one keyboard-first surface.</div>
      </div>
    </aside>
  );
}
