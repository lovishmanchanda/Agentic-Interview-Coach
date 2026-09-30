"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useMemo, useState } from "react";

import Badge from "@/components/ui/Badge";
import EmptyState from "@/components/ui/EmptyState";
import { ArrowRightIcon, ChairIcon, ChatIcon, CodeIcon } from "@/components/ui/icons";
import Tabs from "@/components/ui/Tabs";
import { ADEQUATE, STRONG } from "@/lib/dashboard";
import { INTERVIEW_TYPES, topicLabel } from "@/lib/interviewOptions";
import { labelFor } from "@/lib/profileOptions";

const TYPE_ICON = { technical: ChairIcon, behavioral: ChatIcon, coding: CodeIcon };
const FILTERS = [{ value: "all", label: "All" }, ...INTERVIEW_TYPES.map((t) => ({ value: t.value, label: t.label }))];
const SHOWN = 6;
// "30 Sept" this year, "30 Sept 2025" otherwise: short enough for a phone row.
const shortDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short",
  ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });

function scoreTone(score) {
  if (score >= STRONG) return "success";
  return score >= ADEQUATE ? "neutral" : "warning";
}

/** Every interview you've taken, newest first, filterable by type; each opens its report (or resumes). */
export default function RecentInterviews({ sessions, reports }) {
  const [filter, setFilter] = useState("all");
  const [expanded, setExpanded] = useState(false);
  const scoreByReport = useMemo(() => new Map(reports.map((r) => [r.report_id, r.overall])), [reports]);
  const filtered = sessions.filter((s) => filter === "all" || s.config.interview_type === filter);
  const visible = expanded ? filtered : filtered.slice(0, SHOWN);

  return (
    <div className="space-y-4">
      <Tabs label="Filter interviews by type" tabs={FILTERS} value={filter} onChange={(v) => { setFilter(v); setExpanded(false); }} className="max-w-full overflow-x-auto [mask-image:linear-gradient(to_right,black_82%,transparent)] sm:[mask-image:none]" />
      {filtered.length === 0 ? (
        <EmptyState icon={ChairIcon} title={filter === "all" ? "No interviews yet" : `No ${labelFor(INTERVIEW_TYPES, filter).toLowerCase()} interviews yet`}
          body="Your interviews and their reports will show up here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
          <AnimatePresence initial={false}>
            {visible.map((s) => {
              const Icon = TYPE_ICON[s.config.interview_type] ?? ChairIcon;
              const score = s.report_id ? scoreByReport.get(s.report_id) : null;
              const topics = (s.topics_covered.length ? s.topics_covered : s.focus_topics || []).slice(0, 3).map(topicLabel).join(", ");
              return (
                <motion.li key={s.session_id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
                  <Link href={s.report_id ? `/interview/report/${s.report_id}` : `/interview/session/${s.session_id}`}
                    className="group flex items-center gap-4 bg-surface px-4 py-3.5 transition-colors hover:bg-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary sm:px-5">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-background text-muted">
                      <Icon className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        {labelFor(INTERVIEW_TYPES, s.config.interview_type)}
                        {s.focus_topics?.length > 0 && <span className="rounded-md bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">Drill</span>}
                        {s.config.interview_mode === "serious" && <span className="rounded-md bg-raised px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">Serious</span>}
                      </span>
                      <span className="block truncate text-xs text-muted">
                        {shortDate(new Date(s.started_at))}
                        {topics ? ` · ${topics}` : ""}
                      </span>
                    </span>
                    {typeof score === "number" ? (
                      <Badge tone={scoreTone(score)}><span className="font-mono">{score.toFixed(1)}</span></Badge>
                    ) : (
                      <Badge tone="primary">In progress</Badge>
                    )}
                    <ArrowRightIcon className="size-4 text-subtle transition-transform group-hover:translate-x-0.5 group-hover:text-foreground" />
                  </Link>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {filtered.length > SHOWN && (
        <button type="button" onClick={() => setExpanded((e) => !e)} className="text-sm text-muted hover:text-foreground">
          {expanded ? "Show fewer" : `Show all ${filtered.length}`}
        </button>
      )}
    </div>
  );
}
