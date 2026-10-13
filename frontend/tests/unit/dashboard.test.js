import { describe, expect, it } from "vitest";

import { activity, ariaPrompts, formatDuration, kpis, mastery, nextStep, trend } from "@/lib/dashboard";
import { practiceStreak } from "@/store/shellStore";

const report = (id, overall, extra = {}) => ({ report_id: id, overall, generated_at: "2026-10-01T10:00:00Z", ...extra });
const session = (startedAt, extra = {}) => ({ session_id: startedAt, started_at: startedAt, state: "REPORT_READY", report_id: "r", ...extra });

describe("formatDuration", () => {
  it.each([[0, "0m"], [45, "45s"], [600, "10m"], [3600 + 1500, "1h 25m"]])("%i s → %s", (seconds, text) => {
    expect(formatDuration(seconds)).toBe(text);
  });
});

describe("kpis", () => {
  it("compares the latest report with the one before (newest first), rounded to one decimal", () => {
    const k = kpis([report("b", 7.26, { duration_seconds: 600 }), report("a", 6.1, { duration_seconds: 300 })], []);
    expect(k).toMatchObject({ completed: 2, latestScore: 7.26, delta: 1.2, practiceSeconds: 900 });
  });

  it("has no delta for a first report, and nulls for an empty desk", () => {
    expect(kpis([report("a", 6)], []).delta).toBeNull();
    expect(kpis([], [])).toMatchObject({ completed: 0, latestScore: null, delta: null, practiceSeconds: 0 });
  });
});

describe("trend", () => {
  it("runs oldest → newest", () => {
    expect(trend([report("new", 8), report("old", 5)]).map((p) => p.id)).toEqual(["old", "new"]);
  });
});

describe("mastery", () => {
  it("keeps each topic's newest score, says how it moved, and lists the weakest first", () => {
    const rows = mastery([
      report("new", 7, { per_topic_scores: { dsa: 7.5, dbms: 4.0 } }),
      report("old", 6, { per_topic_scores: { dsa: 6.0, os: 5.5 } }),
    ]);
    expect(rows.map((r) => [r.key, r.value])).toEqual([["dbms", 4], ["os", 5.5], ["dsa", 7.5]]);
    expect(rows.find((r) => r.key === "dsa").detail).toBe("▲ +1.5 since last");
    expect(rows.find((r) => r.key === "dbms").detail).toBe("first time");
  });
});

describe("activity", () => {
  const now = new Date(2026, 9, 3, 15); // Saturday 3 Oct 2026

  it("is 12 weeks of Monday → Sunday columns ending this week, with future days marked", () => {
    const { columns } = activity([], 12, now);
    expect(columns).toHaveLength(12);
    expect(columns.every((c) => c.length === 7)).toBe(true);
    expect(columns[0][0].date.getDay()).toBe(1); // a Monday
    const last = columns[11];
    expect(last.find((d) => d.key === "2026-10-03").future).toBe(false);
    expect(last.find((d) => d.key === "2026-10-04").future).toBe(true);
  });

  it("counts interviews per day", () => {
    const sessions = [session(new Date(2026, 9, 2, 9).toISOString()), session(new Date(2026, 9, 2, 18).toISOString())];
    const { total, activeDays, columns } = activity(sessions, 12, now);
    expect(total).toBe(2);
    expect(activeDays).toBe(1);
    expect(columns[11].find((d) => d.key === "2026-10-02").count).toBe(2);
  });
});

describe("practiceStreak", () => {
  const now = new Date(2026, 9, 3, 9);
  const on = (day) => session(new Date(2026, 9, day, 12).toISOString());

  it("counts consecutive days ending today", () => {
    expect(practiceStreak([on(3), on(2), on(1)], now)).toBe(3);
  });
  it("doesn't lose yesterday's streak before you've practised today", () => {
    expect(practiceStreak([on(2), on(1)], now)).toBe(2);
  });
  it("breaks on a missed day", () => {
    expect(practiceStreak([on(3), on(1)], now)).toBe(1);
    expect(practiceStreak([], now)).toBe(0);
  });
});

describe("nextStep", () => {
  const welcome = { latest: { weakest_topic: "system_design", interview_type: "technical" } };

  it("resumes an unfinished interview first", () => {
    const open = session("2026-10-03T10:00:00Z", { session_id: "s1", report_id: null, state: "QUESTION", config: { interview_type: "technical" } });
    expect(nextStep([open], welcome, 3)).toMatchObject({ title: "Resume your interview", href: "/interview/session/s1" });
  });
  it("then drills the weakest topic", () => {
    const step = nextStep([], welcome, 3);
    expect(step.title).toBe("Drill System design");
    expect(step.href).toBe("/interview/configure?focus=system_design&type=technical");
  });
  it("then suggests another interview, or the first one", () => {
    expect(nextStep([], null, 2).title).toBe("Take another interview");
    expect(nextStep([], null, 0).title).toBe("Take your first interview");
  });
});

describe("ariaPrompts", () => {
  it("offers starter questions to a new user and at most four personal ones later", () => {
    expect(ariaPrompts([], null)).toHaveLength(2);
    const prompts = ariaPrompts([report("a", 6), report("b", 5)], "dbms");
    expect(prompts.length).toBeLessThanOrEqual(4);
    expect(prompts).toContain("Compare my last two interviews");
  });
});
