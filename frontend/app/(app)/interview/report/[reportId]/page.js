"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";

import ScoreBars from "@/components/charts/ScoreBars";
import { PastRound, groupRounds } from "@/components/interview/room/Round";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import Chapter from "@/components/report/Chapter";
import Handoff from "@/components/report/Handoff";
import PrintTranscript from "@/components/report/PrintTranscript";
import ReportHero from "@/components/report/ReportHero";
import Alert from "@/components/ui/Alert";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import { ArrowRightIcon, CheckIcon, PrinterIcon, TargetIcon } from "@/components/ui/icons";
import Skeleton from "@/components/ui/Skeleton";
import StatTile from "@/components/ui/StatTile";
import { api } from "@/lib/api";
import { formatDuration } from "@/lib/format";
import { INTERVIEW_MODES, INTERVIEW_TYPES, dimensionLabel, drillHref, topicLabel } from "@/lib/interviewOptions";
import { TARGET_ROLES, labelFor } from "@/lib/profileOptions";

const SEVERITY = { high: { tone: "warning", label: "High" }, medium: { tone: "neutral", label: "Medium" }, low: { tone: "neutral", label: "Low" } };
const SUB_SCORE_LABEL = {
  technical: "Technical", communication: "Communication", story: "STAR story",
  problem_solving: "Problem solving", complexity: "Complexity", code_quality: "Code quality",
};
const capitalise = (word) => word.charAt(0).toUpperCase() + word.slice(1);
const longDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
const shortDate = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

function Loading() {
  return (
    <div role="status" aria-label="Loading report" className="space-y-6">
      <Skeleton className="h-80 rounded-3xl" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
    </div>
  );
}

/**
 * An interview report, told as a story (Phase 7.9): the verdict and VERA's summary, then how you scored, what
 * went well, what to fix, what to do next, the evidence (every question, answer and note), and finally the
 * handoff to ARIA. Each chapter rises in as it scrolls into view. Prints (or saves as PDF) as clean light pages.
 */
export default function ReportPage() {
  const { reportId } = useParams();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.reports.get(reportId).then(setReport).catch((err) => setError(err.message));
  }, [reportId]);

  if (error) return <Alert tone="error" title="Couldn't load this report">{error}</Alert>;
  if (!report) return <Loading />;

  const config = report.config;
  const typeLabel = config ? labelFor(INTERVIEW_TYPES, config.interview_type) : "Interview";
  // Weakest topics first (score < 7.5), else whatever the weak areas mention: the Weak-Area Drill.
  const drillTopics = [...new Set([
    ...(report.suggested_preparation_plan?.priority_topics || []),
    ...report.weak_areas.map((w) => w.topic),
  ])].slice(0, 5);
  const drillLink = drillHref(drillTopics, { role: config?.role, type: config?.interview_type });
  const stats = report.stats;
  const questionRows = (report.question_scores || []).map((q, i) => ({
    key: q.question_id,
    label: q.is_follow_up ? `Q${q.number ?? i + 1} follow-up` : `Q${q.number ?? i + 1} · ${topicLabel(q.topic)}`,
    value: q.score,
    detail: [q.tests_total ? `${q.tests_passed}/${q.tests_total} tests` : null,
      q.time_taken_s != null && formatDuration(q.time_taken_s), q.hints_used ? "hint used" : null].filter(Boolean).join(" · "),
  }));
  const topicRows = Object.entries(report.per_topic_scores || {}).map(([topic, score]) => ({ key: topic, label: topicLabel(topic), value: score }));
  const dimensionRows = Object.entries(report.dimension_scores || {}).map(([name, score]) => ({ key: name, label: dimensionLabel(name), value: score }));
  const overall = report.scores.overall;
  const subScores = Object.entries(report.scores).filter(([name]) => name !== "overall")
    .map(([name, value]) => ({ label: SUB_SCORE_LABEL[name] || capitalise(name), value }));
  const plan = report.suggested_preparation_plan;
  const rounds = groupRounds(report.transcript || []);
  const meta = [
    config && `${labelFor(INTERVIEW_MODES, config.interview_mode)} mode`,
    config?.role && labelFor(TARGET_ROLES, config.role),
    config?.company,
    stats && `${Math.max(1, Math.round(stats.duration_seconds / 60))} min`,
  ].filter(Boolean).join(" · ");
  const weakest = drillTopics[0] && topicLabel(drillTopics[0]);
  const questions = [
    `What should I work on after my ${typeLabel.toLowerCase()} interview on ${shortDate(report.generated_at)}?`,
    weakest && `Why did I lose marks on ${weakest}?`,
    "Compare this with my previous interview",
    `Make me a one-week study plan${weakest ? ` for ${weakest}` : ""}`,
  ].filter(Boolean);

  // Chapters are numbered in order, skipping any this report has nothing for.
  const shown = {
    scores: Boolean(stats) || questionRows.length > 0, strong: true, fix: true,
    next: plan?.steps?.length > 0 || drillTopics.length > 0, evidence: rounds.length > 0,
  };
  const order = Object.keys(shown).filter((k) => shown[k]);
  const number = (key) => order.indexOf(key) + 1;

  return (
    <article className="space-y-12">
      <ReportHero
        overall={overall}
        subScores={subScores}
        eyebrow={`${typeLabel} interview · ${longDate(report.generated_at)}`}
        meta={meta}
        summary={report.summary}
        sourceNote={report.narrative_source === "llm"
          ? "Written by AI from VERA's notes on each answer. Scores are calculated, not written."
          : "Put together from VERA's notes on each answer."}
        actions={[
          drillTopics.length > 0 && { label: "Practise weak areas", href: drillLink, Icon: TargetIcon, title: `Drill: ${drillTopics.map(topicLabel).join(", ")}` },
          { label: "Interview again", href: "/interview/configure", variant: "secondary" },
          { label: "Print or save as PDF", onClick: () => window.print(), variant: "ghost", Icon: PrinterIcon },
        ].filter(Boolean)}
      />

      {shown.scores && (
        <Chapter number={number("scores")} id="ch-scores" title="How you *scored.*" description="Every answer out of 10, then the same scores by topic and by dimension.">
          <div className="space-y-4">
            {stats && (
              <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                <StatTile label="Answers" value={stats.answers}
                  note={stats.follow_ups ? `incl. ${stats.follow_ups} follow-up${stats.follow_ups > 1 ? "s" : ""}` : "No follow-ups"} />
                <StatTile label="Average per answer" value={formatDuration(stats.average_answer_seconds)} note="minutes : seconds" />
                <StatTile label="Hints used" value={stats.hints_used} note={stats.hints_used ? "One allowed per question" : "None needed"} />
                <StatTile label="Interview length" value={formatDuration(stats.duration_seconds)} note="Start to finish" />
              </div>
            )}
            {questionRows.length > 0 && (
              <div className="grid gap-4 lg:grid-cols-2">
                <ScoreBars title="Score by question" description="Out of 10, in the order asked." rows={questionRows} labelWidth="8.5rem" />
                <div className="space-y-4">
                  {topicRows.length > 1 && <ScoreBars title="Score by topic" description="Average per topic." rows={topicRows} />}
                  {dimensionRows.length > 0 && <ScoreBars title="Score by dimension" description="Average across your answers." rows={dimensionRows} />}
                </div>
              </div>
            )}
          </div>
        </Chapter>
      )}

      <Chapter number={number("strong")} id="ch-strong" title="What went *well.*">
        {report.strong_areas.length ? (
          <Stagger as="ul" className="grid gap-3 md:grid-cols-2">
            {report.strong_areas.map((s) => (
              <StaggerItem as="li" key={s} className="flex gap-3 rounded-2xl border border-border bg-surface p-4 text-sm leading-relaxed">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-success/30 bg-success-soft text-success">
                  <CheckIcon className="size-4" strokeWidth={2.2} />
                </span>
                <span className="pt-0.5">{s}</span>
              </StaggerItem>
            ))}
          </Stagger>
        ) : <p className="text-sm text-muted">Nothing stood out this time. The next chapter says where to start.</p>}
      </Chapter>

      <Chapter number={number("fix")} id="ch-fix" title="What to *fix.*" description="Weak areas, most serious first, and what to do about each.">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">Where marks were lost</h3>
            {report.weak_areas.length ? (
              <Stagger as="ul" className="mt-4 space-y-3">
                {[...report.weak_areas].sort((a, b) => ["high", "medium", "low"].indexOf(a.severity) - ["high", "medium", "low"].indexOf(b.severity)).map((w) => (
                  <StaggerItem as="li" key={`${w.topic}-${w.reason}`} className="space-y-1.5 border-b border-border pb-3 text-sm last:border-0 last:pb-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{topicLabel(w.topic)}</span>
                      <Badge tone={SEVERITY[w.severity]?.tone || "neutral"}>{SEVERITY[w.severity]?.label || w.severity}</Badge>
                    </span>
                    <span className="block leading-relaxed text-muted">{w.reason}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            ) : <p className="mt-3 text-sm text-muted">None recorded.</p>}
          </div>
          <div className="rounded-2xl border border-border bg-surface p-5">
            <h3 className="text-sm font-semibold">What to do about it</h3>
            {report.recommendations.length ? (
              <Stagger as="ul" className="mt-4 space-y-3">
                {report.recommendations.map((r) => (
                  <StaggerItem as="li" key={r.action} className="flex gap-3 text-sm leading-relaxed">
                    <ArrowRightIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>
                      <span className="mr-1.5 font-mono text-[11px] uppercase tracking-wider text-subtle">{r.topic === "general" ? "General" : topicLabel(r.topic)}</span>
                      {r.action}
                    </span>
                  </StaggerItem>
                ))}
              </Stagger>
            ) : <p className="mt-3 text-sm text-muted">No recommendations this time.</p>}
          </div>
        </div>
      </Chapter>

      {shown.next && (
        <Chapter number={number("next")} id="ch-next" title="Your next *steps.*"
          description={plan?.estimated_days ? `About ${plan.estimated_days} day${plan.estimated_days > 1 ? "s" : ""} at an hour a day.` : undefined}>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
            {plan?.steps?.length > 0 && (
              <Stagger as="ol" className="relative space-y-4 rounded-2xl border border-border bg-surface p-5">
                <span aria-hidden="true" className="absolute bottom-8 left-[2.3rem] top-8 w-px bg-border" />
                {plan.steps.map((step, i) => (
                  <StaggerItem as="li" key={step} className="relative flex gap-4 text-sm leading-relaxed">
                    <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full border border-border-strong bg-raised font-mono text-xs">{i + 1}</span>
                    <span className="pt-1">{step}</span>
                  </StaggerItem>
                ))}
              </Stagger>
            )}
            {drillTopics.length > 0 && (
              <div className="self-start rounded-2xl border border-primary/35 bg-[linear-gradient(to_bottom,var(--primary-soft),var(--surface)_85%)] p-5 print:hidden">
                <TargetIcon className="size-6 text-primary" />
                <p className="mt-3 font-medium">Drill {drillTopics.map(topicLabel).join(", ")}</p>
                <p className="mt-1 text-sm text-muted">A practice interview on exactly these, with feedback after each answer.</p>
                <Button href={drillLink} className="mt-4 w-full">Start the drill</Button>
              </div>
            )}
          </div>
        </Chapter>
      )}

      {shown.evidence && (
        <Chapter number={number("evidence")} id="ch-evidence" title="The *evidence.*" description="Every question, your answer and VERA's notes. Open a row to read it.">
          <ol className="space-y-2 print:hidden">
            {rounds.map((round) => <PastRound key={round.key} round={round} serious={false} />)}
          </ol>
          <PrintTranscript rounds={rounds} />
        </Chapter>
      )}

      <Handoff questions={questions} indexed={report.rag_indexed} />
    </article>
  );
}
