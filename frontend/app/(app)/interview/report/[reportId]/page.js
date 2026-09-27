"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import Transcript from "@/components/interview/Transcript";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { topicLabel } from "@/lib/interviewOptions";

const SEVERITY_TONE = { high: "warning", medium: "primary", low: "neutral" };

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
    + (report.config?.role ? `&role=${encodeURIComponent(report.config.role)}` : "");
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted">Interview report · {date}</p>
          <h1 className="mt-1 text-3xl font-semibold">
            {report.scores.overall}
            <span className="text-lg font-normal text-muted"> / 10</span>
          </h1>
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

      <Card title="Summary">
        <p className="text-sm">{report.summary}</p>
        {!report.rag_indexed && (
          <p className="mt-3 text-xs text-muted">The Mentor hasn&apos;t indexed this report yet.</p>
        )}
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

      {report.recommendations.length > 0 && (
        <Card title="Recommendations">
          <ul className="space-y-1.5 text-sm">{report.recommendations.map((r) => <li key={r.action}>• {r.action}</li>)}</ul>
        </Card>
      )}

      <Card title="Transcript replay" description="Each question, your answer, and the evaluator's notes.">
        <Transcript entries={report.transcript} />
      </Card>
    </div>
  );
}
