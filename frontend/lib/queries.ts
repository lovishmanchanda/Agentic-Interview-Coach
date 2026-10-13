import { type QueryKey, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";
import { getQueryClient } from "@/lib/queryClient";
import type { MentorWelcome, PlanSummary, ReportSummary, SessionSummary } from "@/types/models";

/**
 * The server data pages share, with one query key each, so every screen that needs your reports (the desk, the
 * status bar, the sign-in move) reads one cached copy and a request in flight is never sent twice.
 */
export const keys = {
  reports: ["reports"] as const,
  report: (id: string) => ["reports", id] as const,
  sessions: ["interviews"] as const,
  welcome: ["mentor", "welcome"] as const,
  plans: ["prep", "plans"] as const,
};

/** A query: its cache key and how to fetch it (what useQuery, useQueries and fetchShared take). */
type Query<T> = { queryKey: QueryKey; queryFn: () => Promise<T> };

export const queries = {
  reports: { queryKey: keys.reports, queryFn: () => api.reports.list() } satisfies Query<ReportSummary[]>,
  report: (id: string) => ({ queryKey: keys.report(id), queryFn: () => api.reports.get(id), enabled: Boolean(id) }),
  sessions: { queryKey: keys.sessions, queryFn: () => api.interviews.list() } satisfies Query<SessionSummary[]>,
  // ARIA's welcome is optional: it's absent when the mentor isn't configured, and that's not an error.
  welcome: { queryKey: keys.welcome, queryFn: () => api.mentor.welcome().catch(() => null) } satisfies Query<MentorWelcome | null>,
  plans: { queryKey: keys.plans, queryFn: () => api.prep.plans() } satisfies Query<PlanSummary[]>,
};

export const useReport = (id: string) => useQuery(queries.report(id));

/** Cached data if fresh, otherwise fetched (or joined, if already in flight): for code outside components. */
export function fetchShared<T>(query: Query<T>, { force = false } = {}): Promise<T> {
  return getQueryClient().fetchQuery({ ...query, staleTime: force ? 0 : undefined });
}

/** An interview just started: your sessions list has changed (the desk's "resume", the next first-interview check). */
export function refreshAfterStart() {
  getQueryClient().invalidateQueries({ queryKey: keys.sessions });
}

/** An interview just finished: your reports, sessions and what ARIA knows have all changed. */
export function refreshAfterInterview() {
  const client = getQueryClient();
  for (const key of [keys.reports, keys.sessions, keys.welcome]) client.invalidateQueries({ queryKey: key });
}
