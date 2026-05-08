import Link from "next/link";
import { TERMINAL_ROUTES, terminalRouteHref, type TerminalRouteId } from "@/lib/terminal/routes";

export function SidebarNav({
  activeId,
  searchParams,
  marketId,
  onNavigate,
}: {
  activeId?: TerminalRouteId | null;
  searchParams?: URLSearchParams;
  marketId?: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="terminal-section-nav" aria-label="Solvol terminal sections">
      {TERMINAL_ROUTES.map((route) => (
        <Link
          key={route.id}
          href={terminalRouteHref(route, searchParams, marketId)}
          className={route.id === activeId ? "is-active" : ""}
          onClick={onNavigate}
        >
          <strong>{route.label}</strong>
          <span>{route.meta}</span>
        </Link>
      ))}
    </nav>
  );
}
