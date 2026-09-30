"use client";

import { motion } from "motion/react";

import { MentorAvatar } from "@/components/brand/AgentAvatar";
import AgentStatus from "@/components/brand/AgentStatus";
import SplitHeading from "@/components/motion/SplitHeading";
import Button from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";

/**
 * The end of the interview: VERA's closing words, then the handoff. While the report is being written she
 * says so; once it exists, it opens here, and ARIA (who can now answer questions about it) is one click away.
 */
export default function InterviewDone({ closing, reportId, busyText }) {
  return (
    <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-3xl border border-primary/30 bg-[linear-gradient(to_bottom,var(--primary-soft),var(--surface)_75%)] p-6 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -top-24 left-1/2 h-48 w-2/3 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
      <div className="relative">
        <p className="eyebrow">Interview complete</p>
        <SplitHeading as="h2" text="That's a *wrap.*" animateOnMount className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl" />
        {closing && (
          <blockquote className="mt-5 border-l-2 border-steel/50 pl-4 text-[15px] leading-relaxed text-muted">
            <span className="mb-1 block text-xs font-semibold not-italic tracking-wide text-steel">VERA</span>
            {closing}
          </blockquote>
        )}
        {reportId ? (
          <>
            <p className="mt-5 text-sm">VERA has written your report and passed it to ARIA, who can now answer questions about it.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Button href={`/interview/report/${reportId}`} size="lg" className="group">
                Read your report <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button href="/mentor" variant="secondary" size="lg">
                <MentorAvatar size="size-6" /> Talk it through with ARIA
              </Button>
            </div>
          </>
        ) : (
          <div className="mt-6"><AgentStatus agent="interviewer" text={busyText || "Writing your report…"} /></div>
        )}
      </div>
    </motion.section>
  );
}
