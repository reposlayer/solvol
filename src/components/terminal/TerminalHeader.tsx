"use client";

import { type FormEvent, useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTerminal, type WorkspaceMode } from "@/components/terminal/terminal-context";
import { DISCOVERY_DEFAULT_CLOSING_HOURS } from "@/hooks/discovery-url";

function parseCmdModifiers(q: string): {
  limit?: number;
  tagId?: string;
  hours?: number;
} {
  const out: { limit?: number; tagId?: string; hours?: number } = {};
  const lim = q.match(/\blimit\s+(\d{1,3})\b/i);
  if (lim?.[1]) {
    const n = Number.parseInt(lim[1], 10);
    if (Number.isFinite(n)) out.limit = Math.min(Math.max(n, 1), 80);
  }
  const tag = q.match(/\btag(?:_id)?(?:\s+|=)(\d+)\b/i);
  if (tag?.[1]) out.tagId = tag[1];
  const hrs = q.match(/\bhours\s+(\d{1,4})\b/i);
  if (hrs?.[1]) {
    const n = Number.parseInt(hrs[1], 10);
    if (Number.isFinite(n) && n >= 1 && n <= 8760) out.hours = n;
  }
  return out;
}

function terminalPath(
  lane: string,
  mods: { limit?: number; tagId?: string; hours?: number },
): string {
  const sp = new URLSearchParams();
  sp.set("lane", lane);
  if (mods.limit != null) sp.set("limit", String(mods.limit));
  if (mods.tagId) sp.set("tag_id", mods.tagId);
  if (mods.hours != null && mods.hours !== DISCOVERY_DEFAULT_CLOSING_HOURS) {
    sp.set("hours", String(mods.hours));
  }
  return `/terminal?${sp.toString()}`;
}

function modSuffix(mods: {
  limit?: number;
  tagId?: string;
  hours?: number;
}): string {
  const parts: string[] = [];
  if (mods.tagId) parts.push(`tag_id=${mods.tagId}`);
  if (mods.limit != null) parts.push(`limit=${mods.limit}`);
  if (mods.hours != null && mods.hours !== DISCOVERY_DEFAULT_CLOSING_HOURS) {
    parts.push(`hours=${mods.hours}`);
  }
  return parts.length ? `\n// ${parts.join(" · ")}` : "";
}

const EXAMPLES = [
  "HOT",
  "RESEARCH",
  "LEDGER",
  "MODE flow",
  "WATCH 540816",
  "RISK hours 72",
  "WHY 540816",
  "HELP",
];

const MODE_ALIASES: Record<string, WorkspaceMode> = {
  mission: "mission",
  ops: "mission",
  command: "mission",
  flow: "flow",
  tape: "flow",
  scout: "flow",
  research: "research",
  intel: "research",
  thesis: "research",
};

function HeaderClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  if (!now) return <span className="font-mono text-[10px] text-[var(--terminal-muted)]">—</span>;
  return (
    <span className="font-mono text-[10px] tabular-nums text-[var(--terminal-text-2)]">
      {now.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })}
      <span className="ml-1 text-[var(--terminal-muted)]">
        {Intl.DateTimeFormat().resolvedOptions().timeZone.split("/").pop()}
      </span>
    </span>
  );
}

export function TerminalHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    marketId,
    setMarketId,
    workspaceMode,
    setWorkspaceMode,
    watchlist,
    addToWatchlist,
    removeFromWatchlist,
    clearWatchlist,
    runExplainWithId,
    setCommandEcho,
    pushCommandHistory,
  } = useTerminal();
  const [cmd, setCmd] = useState("");
  const cmdInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        cmdInputRef.current?.focus();
      }
      if (e.key === "`") {
        const target = e.target as HTMLElement | null;
        const isTyping =
          target?.tagName === "INPUT" ||
          target?.tagName === "TEXTAREA" ||
          target?.isContentEditable;
        if (!isTyping) {
          e.preventDefault();
          cmdInputRef.current?.focus();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function mergeMarketIdIntoUrl(id: string) {
    if (pathname !== "/terminal") return;
    const sp = new URLSearchParams(window.location.search);
    sp.set("marketId", id);
    router.replace(`/terminal?${sp.toString()}`, { scroll: false });
  }

  function parseAndRun(raw: string) {
    const q = raw.trim();
    if (!q) return;
    pushCommandHistory(q);

    const mods = parseCmdModifiers(q);
    const ms = modSuffix(mods);

    if (/^(help|\?)$/i.test(q)) {
      setCommandEcho(
        [
          "> HELP",
          "// HOT / RESEARCH / CATALYST / ANOMALY / RISK / VOL / CLS / NEW switch scanner lanes",
          "// MODE mission|flow|research changes workspace emphasis",
          "// WATCH <id>, UNWATCH <id>, WATCHLIST, CLEAR WATCHLIST",
          "// LEDGER opens catalyst-rich research lane",
          "// MKT <id> focuses market without analysis",
          "// WHY <id> or EXPLAIN MARKET <id> runs catalyst scoring",
          "// limit <n>, hours <n>, tag <id> modify discovery lanes",
          "// ` or Cmd/Ctrl+K focuses this command bar",
        ].join("\n"),
      );
      return;
    }

    if (/^(research|res|worthy)(\b|$)/i.test(q)) {
      router.push(terminalPath("research_worthy", mods));
      setWorkspaceMode("research");
      setCommandEcho(`> lane research_worthy${ms}\n// Research surface promoted.`);
      return;
    }

    if (/^(catalyst|ledger|sources)(\b|$)/i.test(q)) {
      router.push(terminalPath("catalyst_rich", mods));
      setWorkspaceMode("research");
      setCommandEcho(`> lane catalyst_rich${ms}\n// Source-led scan loaded.`);
      return;
    }

    if (/^(anomaly|anom|spike)(\b|$)/i.test(q)) {
      router.push(terminalPath("anomaly", mods));
      setCommandEcho(`> lane anomaly${ms}\n// Volume anomaly scan loaded.`);
      return;
    }

    if (/^(risk|deadline|resolve)(\b|$)/i.test(q)) {
      router.push(terminalPath("deadline_risk", mods));
      setCommandEcho(`> lane deadline_risk${ms}\n// Resolution risk queue loaded.`);
      return;
    }

    const modeCmd = q.match(/^(mode|workspace|view)\s+([a-z]+)\s*$/i);
    if (modeCmd?.[2]) {
      const mode = MODE_ALIASES[modeCmd[2].toLowerCase()];
      if (mode) {
        setWorkspaceMode(mode);
        setCommandEcho(`> mode ${mode}\n// Workspace emphasis changed.`);
        return;
      }
      setCommandEcho("> mode\n// Available modes: mission, flow, research.");
      return;
    }

    if (/^(watchlist|wl)$/i.test(q)) {
      setCommandEcho(
        watchlist.length
          ? `> watchlist\n// ${watchlist.map((id) => `#${id}`).join(" · ")}`
          : "> watchlist\n// Empty. Try WATCH 540816 or click a star.",
      );
      return;
    }

    if (/^(clear\s+watchlist|watchlist\s+clear|wl\s+clear)$/i.test(q)) {
      clearWatchlist();
      setCommandEcho("> clear watchlist\n// Watchlist reset.");
      return;
    }

    const watchCmd = q.match(/^(watch|pin|star)\s+(\d{5,}|current)\s*$/i);
    if (watchCmd?.[2]) {
      const id = watchCmd[2].toLowerCase() === "current" ? marketId : watchCmd[2];
      addToWatchlist(id);
      setCommandEcho(`> watch ${id}\n// Added to watchlist.`);
      return;
    }

    const unwatchCmd = q.match(/^(unwatch|unpin|unstick)\s+(\d{5,}|current)\s*$/i);
    if (unwatchCmd?.[2]) {
      const id = unwatchCmd[2].toLowerCase() === "current" ? marketId : unwatchCmd[2];
      removeFromWatchlist(id);
      setCommandEcho(`> unwatch ${id}\n// Removed from watchlist.`);
      return;
    }

    if (/\b(closing|close|cls)\b/i.test(q) && /\b(week|soon|day|hours|cls|close)\b/i.test(q)) {
      router.push(terminalPath("closing_soon", mods));
      setCommandEcho(`> lane closing_soon${ms}\n// Scanner + tape switched.`);
      return;
    }
    if (/^(hot|move|moves|top)(\b|$)/i.test(q) || /\b(trending|hot|brija)\b/i.test(q)) {
      router.push(terminalPath("hot", mods));
      setCommandEcho(`> lane hot (Terminal composite)${ms}\n// Scanner + tape switched.`);
      return;
    }
    if (/^(new|ipo|fresh)(\b|$)/i.test(q) || (/\bnew\b/i.test(q) && /\bmarket/i.test(q))) {
      router.push(terminalPath("new", mods));
      setCommandEcho(`> lane new${ms}\n// Scanner + tape switched.`);
      return;
    }
    if (/^(vol|volume|liq)(\b|$)/i.test(q) || /\b(high\s+)?volume\b/i.test(q) || /\bvolume\s+spike/i.test(q)) {
      router.push(terminalPath("high_volume", mods));
      setCommandEcho(`> lane high_volume${ms}\n// Scanner + tape switched.`);
      return;
    }

    const laneCmd = q.match(
      /\blane\s+(hot|research|research_worthy|catalyst|catalyst_rich|anomaly|deadline|deadline_risk|new|closing|closing_soon|close|cls|high|volume|vol|high_volume)\b/i,
    );
    if (laneCmd?.[1]) {
      const v = laneCmd[1].toLowerCase();
      const laneMap: Record<string, string> = {
        hot: "hot",
        research: "research_worthy",
        research_worthy: "research_worthy",
        catalyst: "catalyst_rich",
        catalyst_rich: "catalyst_rich",
        anomaly: "anomaly",
        deadline: "deadline_risk",
        deadline_risk: "deadline_risk",
        new: "new",
        closing: "closing_soon",
        closing_soon: "closing_soon",
        close: "closing_soon",
        cls: "closing_soon",
        high: "high_volume",
        volume: "high_volume",
        vol: "high_volume",
        high_volume: "high_volume",
      };
      const lane = laneMap[v] ?? "hot";
      router.push(terminalPath(lane, mods));
      setCommandEcho(`> lane ${lane}${ms}\n// Scanner + tape switched.`);
      return;
    }

    if (/\bscan\b/i.test(q) && /\bvol/i.test(q)) {
      router.push(terminalPath("high_volume", mods));
      setCommandEcho(`> scan volume → lane high_volume${ms}`);
      return;
    }

    const explainMatch = q.match(/explain\s+market\s+(\d+)/i);
    if (explainMatch?.[1]) {
      setCommandEcho(`> explain market ${explainMatch[1]}`);
      mergeMarketIdIntoUrl(explainMatch[1]);
      void runExplainWithId(explainMatch[1]);
      return;
    }

    const explainBare = q.match(/^(explain|why|cat|catalyst)\s+(\d{5,})\s*$/i);
    const explainBareId = explainBare?.[2];
    if (explainBareId) {
      setCommandEcho(`> explain ${explainBareId}`);
      mergeMarketIdIntoUrl(explainBareId);
      void runExplainWithId(explainBareId);
      return;
    }

    const marketCmd = q.match(/^(mkt|market|load|go)\s+(\d{5,})\s*$/i);
    if (marketCmd?.[2]) {
      setMarketId(marketCmd[2]);
      mergeMarketIdIntoUrl(marketCmd[2]);
      setCommandEcho(`> load market ${marketCmd[2]}\n// Snapshot, lens and flow context updated.`);
      return;
    }

    const idOnly = q.match(/^\s*(\d{5,})\s*$/);
    if (idOnly?.[1]) {
      setMarketId(idOnly[1]);
      mergeMarketIdIntoUrl(idOnly[1]);
      setCommandEcho(`> load market ${idOnly[1]}`);
      return;
    }

    setCommandEcho(`> ${q}\n// Unknown command. Try HELP, HOT, VOL, CLS, MKT ${marketId}, WHY ${marketId}.`);
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    parseAndRun(cmd);
    setCmd("");
  }

  const lane = searchParams.get("lane") ?? "hot";

  return (
    <header className="relative flex shrink-0 flex-col border-b border-[var(--terminal-border)] bg-gradient-to-b from-[var(--terminal-panel-2)] to-[var(--terminal-panel)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--terminal-cyan)]/40 to-transparent" />
      <div className="flex h-12 items-center gap-3 px-3">
        <div className="flex items-baseline gap-2">
          <span className="aurora-text aurora-glow text-[15px] font-bold tracking-[0.24em]">
            SOLVOL
          </span>
          <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-[var(--terminal-muted)]">
            Aurora · v0.5
          </span>
        </div>

        <div className="hidden items-center gap-1 lg:flex">
          <span className="font-mono text-[9px] uppercase tracking-wide text-[var(--terminal-muted)]">
            Lane
          </span>
          <span className="rounded-sm border border-[var(--terminal-cyan)]/40 bg-[var(--terminal-cyan-soft)] px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wide text-[var(--terminal-cyan)]">
            {lane}
          </span>
          <span className="ml-1 font-mono text-[9px] uppercase tracking-wide text-[var(--terminal-muted)]">
            Mode
          </span>
          <span className="rounded-sm border border-[var(--terminal-amber)]/40 bg-[var(--terminal-amber-soft)] px-1.5 py-[1px] font-mono text-[10px] uppercase tracking-wide text-[var(--terminal-amber)]">
            {workspaceMode}
          </span>
        </div>

        <form onSubmit={onSubmit} className="flex max-w-2xl flex-1 items-center gap-2">
          <span className="shrink-0 font-mono text-[11px] text-[var(--terminal-cyan)]">⌘K</span>
          <input
            ref={cmdInputRef}
            type="text"
            value={cmd}
            onChange={(e) => setCmd(e.target.value)}
            placeholder="Command: HOT · VOL limit 60 · CLS hours 48 · MKT 540816 · WHY 540816"
            className="h-8 w-full rounded-sm border border-[var(--terminal-border)] bg-[var(--terminal-bg-2)] px-3 font-mono text-[12px] text-[var(--terminal-text)] placeholder:text-[var(--terminal-muted)] outline-none focus:border-[var(--terminal-cyan)] focus:ring-1 focus:ring-[var(--terminal-cyan)]/30"
            aria-label="Terminal command"
            aria-keyshortcuts="Meta+K Control+K `"
          />
        </form>

        <div className="hidden items-center gap-3 sm:flex">
          <HeaderClock />
          <div className="font-mono text-[10px] text-[var(--terminal-muted)]">
            WL <span className="tnum text-[var(--terminal-text-2)]">{watchlist.length}</span>
          </div>
          <div className="flex items-center gap-1 font-mono text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--terminal-up)] animate-pulse-slow" />
            <span className="text-[var(--terminal-muted)]">PM-GAMMA</span>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--terminal-border)]/60 bg-[var(--terminal-panel-2)]/40 px-3 py-1 font-mono text-[10px] text-[var(--terminal-muted)]">
        <span className="text-[var(--terminal-muted)]">try:</span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            className="rounded-sm border border-[var(--terminal-border)]/60 px-1.5 py-[1px] text-left text-[var(--terminal-text-2)] hover:border-[var(--terminal-cyan)]/60 hover:text-[var(--terminal-cyan)]"
            onClick={() => {
              setCmd(ex);
              parseAndRun(ex);
            }}
          >
            {ex}
          </button>
        ))}
        <span className="ml-auto shrink-0 text-[9px] opacity-80">
          ` / ⌘K / Ctrl+K — focus command
        </span>
      </div>
    </header>
  );
}
