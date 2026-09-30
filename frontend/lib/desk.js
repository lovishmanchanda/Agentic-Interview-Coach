import { topicLabel } from "@/lib/interviewOptions";

/** GET /reports items → the printed sheets on the desk (newest first; the API already sorts them). */
export function sheetsFromReports(reports = []) {
  return reports.map((r) => ({
    id: r.report_id,
    score: r.overall,
    label: r.topics?.length ? r.topics.slice(0, 2).map(topicLabel).join(" · ") : "Interview",
    date: new Date(r.generated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }),
  }));
}
