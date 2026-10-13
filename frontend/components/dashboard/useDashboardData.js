"use client";

import { useQueries } from "@tanstack/react-query";

import { queries } from "@/lib/queries";

/**
 * Everything the dashboard shows, from the shared cache (lib/queries.js): fetched in parallel the first time,
 * instant when you come back, refreshed in the background when stale. A failed list counts as empty (the page
 * still renders); ARIA's welcome is optional (null when the mentor isn't configured).
 */
export default function useDashboardData() {
  return useQueries({
    queries: [queries.reports, queries.sessions, queries.welcome, queries.plans],
    combine: ([reports, sessions, welcome, plans]) => {
      const settled = [reports, sessions, welcome, plans].every((q) => q.isSuccess || q.isError);
      return {
        status: settled ? "ready" : "loading",
        reports: reports.data ?? [],
        sessions: sessions.data ?? [],
        welcome: welcome.data ?? null,
        plans: plans.data ?? [],
      };
    },
  });
}
