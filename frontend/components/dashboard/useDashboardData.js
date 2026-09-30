"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";

/**
 * Everything the dashboard shows, fetched once in parallel. A failed list is treated as empty (the page still
 * renders); ARIA's welcome is optional (it's absent when the mentor isn't configured).
 */
export default function useDashboardData() {
  const [data, setData] = useState({ status: "loading", reports: [], sessions: [], welcome: null, plans: [] });
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.reports.list().catch(() => []),
      api.interviews.list().catch(() => []),
      api.mentor.welcome().catch(() => null),
      api.prep.plans().catch(() => []),
    ]).then(([reports, sessions, welcome, plans]) => {
      if (!cancelled) setData({ status: "ready", reports, sessions, welcome, plans });
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}
