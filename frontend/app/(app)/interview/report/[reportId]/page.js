"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ScoreBars, { tierFor } from "@/components/charts/ScoreBars";
import Transcript from "@/components/interview/Transcript";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { INTERVIEW_MODES, INTERVIEW_TYPES, topicLabel, dimensionLabel } from "@/lib/interviewOptions";
import { labelFor } from "@/lib/profileOptions";

const SEVERITY_TONE = { high: "warning", medium: "primary", low: "neutral" };

/** A headline number: sentence-case label, the value, and an optional note. */
function StatTile({ label, value, note }) {
  return (
    <div className="rounded-xl border border-border bg-surface px-4 py-3">
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const SUB_SCORE_LABEL = {
  technical: "Technical", communication: "Communication", story: "STAR story",
  problem_solving: "Problem solving", complexity: "Complexity", code_quality: "Code quality",
};

export default function ReportPage() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.reports.get(reportId).then(setReport).catch((err) => setError(err.message));
  }, [reportId]);

  if (error) return <Alert tone="error" title="Couldn't load this report">{error}</Alert>;
  if (!report) return <Spinner label="Loading report…" />;

  const date = new Date(report.generated_at).toLocaleString();
  // Weakest topics first (score < 7.5), else whatever the weak areas mention: the Weak-Area Drill.
  const drillTopics = [...new Set([
    ...(report.suggested_preparation_plan?.priority_topics || []),
    ...report.weak_areas.map((w) => w.topic),
  ])].slice(0, 5);
  const drillHref = `/interview/configure?focus=${drillTopics.map(encodeURIComponent).join(",")}`
    + (report.config?.role ? `&role=${encodeURIComponent(report.config.role)}` : "")
    + (report.config?.interview_type ? `&type=${report.config.interview_type}` : "");
  const stats = report.stats;
  const questionRows = (report.question_scores || []).map((q, i) => ({
    key: q.question_id,
    label: q.is_follow_up ? `Q${q.number ?? i + 1} follow-up` : `Q${q.number ?? i + 1} · ${topicLabel(q.topic)}`,
    value: q.score,
    detail: [q.tests_total ? `${q.tests_passed}/${q.tests_total} tests` : null,
      q.time_taken_s != null && formatDuration(q.time_taken_s), q.hints_used ? "hint used" : null].filter(Boolean).join(" · "),
  }));
  const topicRows = Object.entries(report.per_topic_scores || {}).map(([topic, score]) => ({
    key: topic, label: topicLabel(topic), value: score,
  }));
  const dimensionRows = Object.entries(report.dimension_scores || {}).map(([name, score]) => ({
    key: name, label: dimensionLabel(name), value: score,
  }));
  const overall = report.scores.overall;
  const subScores = Object.entries(report.scores).filter(([name]) => name !== "overall");
  const plan = report.suggested_preparation_plan;
  const kind = report.config
    ? `${labelFor(INTERVIEW_TYPES, report.config.interview_type)} · ${labelFor(INTERVIEW_MODES, report.config.interview_mode)} mode`
    : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Interview report · {date}{kind ? ` · ${kind}` : ""}</p>
          {/* The page's one hero number. */}
          <p className="mt-1 flex items-baseline gap-2">
            <span className="text-5xl font-semibold">{overall}</span>
            <span className="text-lg text-muted">/ 10</span>
            <Badge tone={{ strong: "success", adequate: "primary", weak: "warning" }[tierFor(overall)]}>{tierFor(overall)}</Badge>
          </p>
          {subScores.length > 0 && (
            <p className="mt-1 text-sm text-muted">
              {subScores.map(([name, value], i) => (
                <span key={name}>{i > 0 && " · "}{SUB_SCORE_LABEL[name] || capitalise(name)} <span className="font-medium text-foreground">{value}</span></span>
              ))}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-3">
          <Button href="/mentor">Talk to Mentor</Button>
          {drillTopics.length > 0 && (
            <Button href={drillHref} variant="secondary"
              title={`Drill: ${drillTopics.map(topicLabel).join(", ")}`}>
              Practise weak areas
            </Button>
          )}
          <Button href="/interview/configure" variant="secondary">Interview again</Button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Answers" value={stats.answers}
            note={stats.follow_ups ? `incl. ${stats.follow_ups} follow-up${stats.follow_ups > 1 ? "s" : ""}` : null} />
          <StatTile label="Average time per answer" value={formatDuration(stats.average_answer_seconds)} />
          <StatTile label="Hints used" value={stats.hints_used} />
          <StatTile label="Interview length" value={formatDuration(stats.duration_seconds)} />
        </div>
      )}

      {questionRows.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ScoreBars title="Score by question" description="Out of 10, in the order asked." rows={questionRows} labelWidth="8.5rem" />
          <div className="space-y-4">
            {topicRows.length > 1 && <ScoreBars title="Score by topic" description="Average per topic." rows={topicRows} />}
            {dimensionRows.length > 0 && (
              <ScoreBars title="Score by dimension" description="Average across your answers." rows={dimensionRows} />
            )}
          </div>
        </div>
      )}

      <Card title="Summary">
        <p className="text-sm leading-relaxed">{report.summary}</p>
        <p className="mt-3 text-xs text-muted">
          {report.narrative_source === "llm"
            ? "Written by AI from the evaluator's notes on each answer. Scores are calculated, not written."
            : "Put together from the evaluator's notes on each answer."}
          {!report.rag_indexed && " The Mentor hasn't indexed this report yet."}
        </p>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Strong areas">
          {report.strong_areas.length ? (
            <ul className="space-y-1.5 text-sm">{report.strong_areas.map((s) => <li key={s}>• {s}</li>)}</ul>
          ) : <p className="text-sm text-muted">None recorded.</p>}
        </Card>
        <Card title="Weak areas">
          {report.weak_areas.length ? (
            <ul className="space-y-2 text-sm">
              {report.weak_areas.map((w) => (
                <li key={w.reason} className="flex items-start gap-2">
                  <Badge tone={SEVERITY_TONE[w.severity]}>{topicLabel(w.topic)}</Badge>
                  <span>{w.reason}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">None recorded.</p>}
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {report.recommendations.length > 0 && (
          <Card title="Recommendations">
            <ul className="space-y-2 text-sm">
              {report.recommendations.map((r) => (
                <li key={r.action} className="flex items-start gap-2">
                  <Badge tone={r.topic === "general" ? "neutral" : SEVERITY_TONE[r.priority]}>
                    {r.topic === "general" ? "General" : topicLabel(r.topic)}
                  </Badge>
                  <span>{r.action}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {plan?.steps?.length > 0 && (
          <Card title="Next steps"
            description={plan.estimated_days ? `About ${plan.estimated_days} day${plan.estimated_days > 1 ? "s" : ""} at an hour a day.` : undefined}>
            <ol className="list-decimal space-y-1.5 pl-5 text-sm">{plan.steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </Card>
        )}
      </div>

      <Card title="Transcript replay" description="Each question, your answer, and the evaluator's notes.">
        <Transcript entries={report.transcript} />
      </Card>
    </div>
  );
}
