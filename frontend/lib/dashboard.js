/**
 * The dashboard's numbers, derived from the API's lists (GET /reports, /interviews, /prep/plans, /mentor/welcome).
 * Pure functions: nothing here fetches or renders, and nothing is made up. Reports arrive newest first.
 */
import { topicLabel } from "@/lib/interviewOptions";
import { practiceStreak } from "@/store/shellStore";

export const STRONG = 7.5; // the evaluator's tier boundaries (see ScoreBars)
export const ADEQUATE = 5;

export function formatDuration(totalSeconds) {
  if (!totalSeconds) return "0m";
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.round((totalSeconds % 3600) / 60);
  return hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

export function kpis(reports, sessions) {
  const [latest, previous] = reports;
  const seconds = reports.reduce((sum, r) => sum + (r.duration_seconds || 0), 0);
  return {
    completed: reports.length,
    latestScore: latest?.overall ?? null,
    delta: latest && previous ? Math.round((latest.overall - previous.overall) * 10) / 10 : null,
    streak: practiceStreak(sessions),
    practiceSeconds: seconds,
  };
}

/** Oldest → newest points for the trend line. */
export function trend(reports) {
  return [...reports].reverse().map((r) => ({
    id: r.report_id,
    score: r.overall,
    type: r.interview_type,
    date: new Date(r.generated_at),
  }));
}

/**
 * Each topic's most recent score, and how it moved since the time before: newest report wins.
 * Weakest first, so the eye lands on what to practise.
 */
export function mastery(reports) {
  const latest = new Map();
  const before = new Map();
  for (const r of reports) {
    for (const [topic, score] of Object.entries(r.per_topic_scores || {})) {
      if (!latest.has(topic)) latest.set(topic, score);
      else if (!before.has(topic)) before.set(topic, score);
    }
  }
  return [...latest.entries()]
    .map(([topic, score]) => {
      const change = before.has(topic) ? Math.round((score - before.get(topic)) * 10) / 10 : null;
      return {
        key: topic,
        label: topicLabel(topic),
        value: score,
        detail: change === null ? "first time" : `${change >= 0 ? "▲ +" : "▼ "}${change.toFixed(1)} since last`,
      };
    })
    .sort((a, b) => a.value - b.value);
}

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/**
 * The last `weeks` weeks as columns of 7 days (Mon → Sun), each day with how many interviews you started.
 * The final column ends with this week; days after today are marked `future`.
 */
export function activity(sessions, weeks = 12, now = new Date()) {
  const counts = new Map();
  for (const s of sessions) {
    const key = dayKey(new Date(s.started_at));
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const mondayOffset = (today.getDay() + 6) % 7; // 0 = Monday
  const start = new Date(today);
  start.setDate(today.getDate() - mondayOffset - (weeks - 1) * 7);
  const columns = [];
  for (let w = 0; w < weeks; w += 1) {
    const days = [];
    for (let d = 0; d < 7; d += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      days.push({ date, key: dayKey(date), count: counts.get(dayKey(date)) || 0, future: date > today });
    }
    columns.push(days);
  }
  const total = columns.flat().reduce((sum, d) => sum + d.count, 0);
  const activeDays = columns.flat().filter((d) => d.count > 0).length;
  return { columns, total, activeDays };
}

/** The one thing to do next, in order: finish what you started, drill your weakest topic, or begin. */
export function nextStep(sessions, welcome, reportCount) {
  const open = sessions.find((s) => !s.report_id && s.state !== "REPORT_READY");
  if (open) return { title: "Resume your interview", detail: `${open.config.interview_type} · in progress`, href: `/interview/session/${open.session_id}` };
  const weakest = welcome?.latest?.weakest_topic;
  if (weakest) return { title: `Drill ${topicLabel(weakest)}`, detail: "Your weakest topic last time", href: `/interview/configure?focus=${encodeURIComponent(weakest)}` };
  if (reportCount) return { title: "Take another interview", detail: "Keep the streak going", href: "/interview/configure" };
  return { title: "Take your first interview", detail: "About fifteen minutes with VERA", href: "/interview/configure" };
}

/** Questions worth asking ARIA, built from your own results. */
export function ariaPrompts(reports, weakestTopic) {
  if (!reports.length) return ["What will VERA ask me?", "How are interviews scored?"];
  const prompts = [];
  if (weakestTopic) prompts.push(`Why do I keep losing marks on ${topicLabel(weakestTopic)}?`); // keeps acronyms (DSA, OOP)
  prompts.push("What should I practise this week?");
  if (reports.length > 1) prompts.push("Compare my last two interviews");
  prompts.push("What am I strongest at?");
  return prompts.slice(0, 4);
}
