"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MarketMoveExplanation } from "@/lib/domain/types";

export type WorkspaceMode = "mission" | "flow" | "research";

export type TerminalContextValue = {
  marketId: string;
  setMarketId: (id: string) => void;
  workspaceMode: WorkspaceMode;
  setWorkspaceMode: (mode: WorkspaceMode) => void;
  watchlist: string[];
  addToWatchlist: (id: string) => void;
  removeFromWatchlist: (id: string) => void;
  toggleWatchlist: (id: string) => void;
  clearWatchlist: () => void;
  isWatched: (id: string | null | undefined) => boolean;
  commandHistory: string[];
  pushCommandHistory: (cmd: string) => void;
  loading: boolean;
  error: string | null;
  result: MarketMoveExplanation | null;
  runExplain: () => Promise<void>;
  /** Fetch catalyst for a specific id (avoids stale state after setMarketId). */
  runExplainWithId: (id: string) => Promise<void>;
  commandEcho: string | null;
  setCommandEcho: (s: string | null) => void;
};

const TerminalContext = createContext<TerminalContextValue | null>(null);

const WATCHLIST_KEY = "solvol:terminal:watchlist";
const MODE_KEY = "solvol:terminal:workspace-mode";
const COMMAND_HISTORY_KEY = "solvol:terminal:command-history";

function cleanMarketId(id: string): string | null {
  const s = id.trim();
  return /^\d{3,}$/.test(s) ? s : null;
}

function readStringArray(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

export function TerminalProvider({
  children,
  initialMarketId,
}: {
  children: ReactNode;
  initialMarketId?: string;
}) {
  const [marketId, setMarketIdState] = useState(initialMarketId ?? "540816");
  const [workspaceMode, setWorkspaceModeState] = useState<WorkspaceMode>("mission");
  const [watchlist, setWatchlist] = useState<string[]>([]);
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<MarketMoveExplanation | null>(null);
  const [commandEcho, setCommandEcho] = useState<string | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setWatchlist(
        readStringArray(WATCHLIST_KEY)
          .map((id) => cleanMarketId(id))
          .filter((id): id is string => id !== null)
          .slice(0, 24),
      );
      setCommandHistory(readStringArray(COMMAND_HISTORY_KEY).slice(0, 18));
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const setWorkspaceMode = useCallback((mode: WorkspaceMode) => {
    setWorkspaceModeState(mode);
    window.localStorage.setItem(MODE_KEY, mode);
  }, []);

  const setMarketId = useCallback((id: string) => {
    const clean = cleanMarketId(id);
    if (!clean) return;
    setMarketIdState(clean);
    setError(null);
    setLoading(false);
    setResult((prev) => (prev?.marketId === clean ? prev : null));
  }, []);

  const addToWatchlist = useCallback((id: string) => {
    const clean = cleanMarketId(id);
    if (!clean) return;
    setWatchlist((prev) => {
      const next = [clean, ...prev.filter((item) => item !== clean)].slice(0, 24);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeFromWatchlist = useCallback((id: string) => {
    const clean = cleanMarketId(id);
    if (!clean) return;
    setWatchlist((prev) => {
      const next = prev.filter((item) => item !== clean);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const toggleWatchlist = useCallback((id: string) => {
    const clean = cleanMarketId(id);
    if (!clean) return;
    setWatchlist((prev) => {
      const next = prev.includes(clean)
        ? prev.filter((item) => item !== clean)
        : [clean, ...prev].slice(0, 24);
      window.localStorage.setItem(WATCHLIST_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const clearWatchlist = useCallback(() => {
    setWatchlist([]);
    window.localStorage.setItem(WATCHLIST_KEY, "[]");
  }, []);

  const isWatched = useCallback(
    (id: string | null | undefined) => {
      if (!id) return false;
      return watchlist.includes(id);
    },
    [watchlist],
  );

  const pushCommandHistory = useCallback((cmd: string) => {
    const clean = cmd.trim();
    if (!clean) return;
    setCommandHistory((prev) => {
      const next = [clean, ...prev.filter((item) => item !== clean)].slice(0, 18);
      window.localStorage.setItem(COMMAND_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const runExplainWithId = useCallback(async (id: string) => {
    setMarketId(id);
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/explain?marketId=${encodeURIComponent(id.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        setResult(null);
        setError(typeof data.error === "string" ? data.error : "Request failed");
        return;
      }
      setResult(data as MarketMoveExplanation);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [setMarketId]);

  const runExplain = useCallback(async () => {
    await runExplainWithId(marketId);
  }, [marketId, runExplainWithId]);

  const value = useMemo(
    () => ({
      marketId,
      setMarketId,
      workspaceMode,
      setWorkspaceMode,
      watchlist,
      addToWatchlist,
      removeFromWatchlist,
      toggleWatchlist,
      clearWatchlist,
      isWatched,
      commandHistory,
      pushCommandHistory,
      loading,
      error,
      result,
      runExplain,
      runExplainWithId,
      commandEcho,
      setCommandEcho,
    }),
    [
      marketId,
      setMarketId,
      workspaceMode,
      setWorkspaceMode,
      watchlist,
      addToWatchlist,
      removeFromWatchlist,
      toggleWatchlist,
      clearWatchlist,
      isWatched,
      commandHistory,
      pushCommandHistory,
      loading,
      error,
      result,
      runExplain,
      runExplainWithId,
      commandEcho,
    ],
  );

  return <TerminalContext.Provider value={value}>{children}</TerminalContext.Provider>;
}

export function useTerminal(): TerminalContextValue {
  const ctx = useContext(TerminalContext);
  if (!ctx) {
    throw new Error("useTerminal must be used within TerminalProvider");
  }
  return ctx;
}
