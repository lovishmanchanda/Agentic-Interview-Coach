"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";

import { InterviewerAvatar, MentorAvatar } from "@/components/brand/AgentAvatar";
import SplitHeading from "@/components/motion/SplitHeading";
import Button from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";

const ask = (question) => `/mentor?q=${encodeURIComponent(question)}`;

/** VERA's steel light travelling along a wire into ARIA's lamp: the report changing hands. */
function Wire() {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="relative mx-3 h-px flex-1 bg-gradient-to-r from-steel/60 via-border-strong to-primary/70">
      {!reduce && (
        <motion.span className="absolute -top-[3px] size-[7px] rounded-full bg-[#e8eef8] shadow-[0_0_12px_2px_rgb(124_147_181/0.8)]"
          initial={{ left: "0%", opacity: 0 }} animate={{ left: ["0%", "100%"], opacity: [0, 1, 1, 0] }}
          transition={{ duration: 2.6, repeat: Infinity, repeatDelay: 0.8, ease: "easeInOut" }} />
      )}
    </div>
  );
}

/**
 * The report's last word: the handoff from the interviewer to the mentor, which is the product's loop made
 * visible. Questions for ARIA are built from this report and open the chat with the question typed in.
 */
export default function Handoff({ questions, indexed }) {
  const [primary, ...more] = questions;
  return (
    <section aria-labelledby="handoff-title"
      className="relative overflow-hidden rounded-3xl border border-primary/30 bg-[linear-gradient(135deg,var(--steel-soft),var(--surface)_45%,var(--primary-soft))] p-6 sm:p-10 print:hidden">
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-16 h-64 w-96 rounded-full bg-primary/15 blur-3xl" />
      <div className="relative">
        <div className="flex max-w-sm items-center">
          <InterviewerAvatar size="size-12" />
          <Wire />
          <MentorAvatar size="size-12" active />
        </div>
        <p className="eyebrow mt-8">The handoff</p>
        <SplitHeading id="handoff-title" text="VERA has passed your report to *ARIA.*"
          className="mt-3 max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl" />
        <p className="mt-4 max-w-2xl text-[15px] leading-relaxed text-muted">
          {indexed
            ? "ARIA has read it alongside your other interviews. Ask why you lost marks, what to practise next, or how this compares with last time. She answers from your reports and cites them."
            : "ARIA is still reading it; give her a moment. She answers from your reports and cites them."}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button href={ask(primary)} size="lg" className="group">
            Talk it through with ARIA <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Button>
        </div>
        {more.length > 0 && (
          <ul className="mt-5 flex flex-wrap gap-2" aria-label="Or ask ARIA">
            {more.map((q) => (
              <li key={q}>
                <Link href={ask(q)} className="inline-flex items-center rounded-full border border-border-strong bg-background/40 px-3.5 py-1.5 pointer-coarse:min-h-11 text-sm text-muted transition-colors hover:border-primary/60 hover:text-foreground">
                  {q}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
