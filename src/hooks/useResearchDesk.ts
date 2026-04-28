"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AlertKind,
  AlertRule,
  AlertEvent,
  ResearchSessionPayload,
  ResearchWorkspace,
  SavedReport,
  SourceLedgerEntry,
} from "@/lib/research/types";

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  const json = await res.json();
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  }
  return json as T;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(typeof json.error === "string" ? json.error : "Request failed");
  }
  return json as T;
}

export function useResearchSession() {
  return useQuery({
    queryKey: ["research", "session"],
    queryFn: () => getJson<ResearchSessionPayload>("/api/research/session"),
    staleTime: 60_000,
  });
}

export function useResearchWorkspace() {
  return useQuery({
    queryKey: ["research", "workspace"],
    queryFn: () =>
      getJson<{ workspace: ResearchWorkspace; fetchedAt: string }>("/api/research/workspace"),
    staleTime: 30_000,
  });
}

export function useResearchAlerts() {
  return useQuery({
    queryKey: ["research", "alerts"],
    queryFn: () =>
      getJson<{ alerts: AlertRule[]; events: AlertEvent[]; fetchedAt: string }>("/api/research/alerts"),
    staleTime: 30_000,
  });
}

export function useSourceLedger(marketId?: string | null) {
  return useQuery({
    queryKey: ["research", "ledger", marketId ?? ""],
    queryFn: () =>
      getJson<{ items: SourceLedgerEntry[]; fetchedAt: string }>(
        `/api/research/ledger${marketId ? `?marketId=${encodeURIComponent(marketId)}` : ""}`,
      ),
    staleTime: 30_000,
  });
}

export function useResearchReports() {
  return useQuery({
    queryKey: ["research", "reports"],
    queryFn: () => getJson<{ items: SavedReport[]; fetchedAt: string }>("/api/research/reports"),
    staleTime: 30_000,
  });
}

export function useSaveWorkspacePatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: unknown) => postJson("/api/research/workspace", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["research", "workspace"] }),
  });
}

export function useCreateResearchAlert() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { marketId?: string | null; name: string; kind: AlertKind; threshold?: number | null }) =>
      postJson("/api/research/alerts", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["research", "alerts"] }),
  });
}

export function useCreateResearchReport() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; marketIds: string[]; bodyMd: string; isPublic?: boolean }) =>
      postJson("/api/research/reports", body),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["research", "reports"] }),
  });
}
