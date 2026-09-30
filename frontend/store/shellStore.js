"use client";

import { create } from "zustand";

import { api } from "@/lib/api";

/** Days in a row with at least one interview started, ending today (or yesterday, so a streak isn't lost at 9 am). */
export function practiceStreak(sessions, now = new Date()) {
  const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  const days = new Set(sessions.map((s) => dayKey(new Date(s.started_at))));
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * What the app shell shows around every page (the status bar, the command palette's shortcuts): loaded once
 * per signed-in visit and refreshed on demand. Failures just leave it empty; the shell never blocks on it.
 */
export const useShellStore = create((set, get) => ({
  status: "idle", // idle | loading | ready
  streak: 0,
  interviews: 0,
  inProgress: null, // { session_id } of an unfinished interview
  reports: 0,
  latestReportId: null,
  weakestTopic: null,
  mentorAvailable: true,
  pendingReports: 0,

  load: async ({ force = false } = {}) => {
    if (!force && get().status !== "idle") return;
    set({ status: "loading" });
    const [sessions, reports, welcome] = await Promise.all([
      api.interviews.list().catch(() => []),
      api.reports.list().catch(() => []),
      api.mentor.welcome().catch(() => null),
    ]);
    const open = sessions.find((s) => !s.report_id && s.state !== "REPORT_READY");
    set({
      status: "ready",
      streak: practiceStreak(sessions),
      interviews: sessions.length,
      inProgress: open ? { session_id: open.session_id } : null,
      reports: reports.length,
      latestReportId: reports[0]?.report_id ?? null,
      weakestTopic: welcome?.latest?.weakest_topic ?? null,
      mentorAvailable: welcome ? welcome.mentor_available : true,
      pendingReports: welcome?.pending_reports ?? 0,
    });
  },

  reset: () => set({ status: "idle", streak: 0, interviews: 0, inProgress: null, reports: 0, latestReportId: null,
    weakestTopic: null, pendingReports: 0 }),
}));
