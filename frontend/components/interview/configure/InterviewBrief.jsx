"use client";

import { AnimatePresence, motion } from "motion/react";

import { InterviewerAvatar } from "@/components/brand/AgentAvatar";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";
import SpotlightCard from "@/components/ui/SpotlightCard";
import { CODING_LANGUAGES, INTERVIEW_MODES, topicLabel } from "@/lib/interviewOptions";
import { estimateMinutes } from "@/lib/interviewPresets";
import { DIFFICULTIES, TARGET_ROLES, labelFor } from "@/lib/profileOptions";

const NOUN = { technical: "technical question", behavioral: "behavioural question", coding: "coding problem" };
const LEVEL = {
  fresher: "at fresher level",
  "1-2": "pitched at 1–2 years' experience",
  "3-5": "pitched at 3–5 years' experience",
  senior: "at senior level",
};
const MODE_DETAIL = { practice: "feedback after every answer", serious: "scores only in the report" };

/** "3 technical questions for the Software Engineer role, pitched at 1–2 years' experience, all on DSA." */
function sentence(form) {
  const noun = `${NOUN[form.interview_type] || "question"}${form.question_count === 1 ? "" : "s"}`;
  const focus = form.focus_topics.length ? `, all on ${form.focus_topics.map(topicLabel).join(", ")}` : "";
  return `I'll ask you ${form.question_count} ${noun} for the ${labelFor(TARGET_ROLES, form.role)} role, ${LEVEL[form.experience_level] || "at your level"}${focus}.`;
}

/**
 * VERA's summary of the interview you're about to take, in her words, with the Start button. Sticky beside
 * the options on wide screens, so every change shows up here straight away.
 */
export default function InterviewBrief({ form, presetTitle, starting, error }) {
  const coding = form.interview_type === "coding";
  const rows = [
    ["Mode", `${labelFor(INTERVIEW_MODES, form.interview_mode)}: ${MODE_DETAIL[form.interview_mode]}`],
    ["Length", `About ${estimateMinutes(form.interview_type, form.question_count)} minutes`],
    ["Difficulty", labelFor(DIFFICULTIES, form.difficulty).replace(" (recommended)", "")],
    coding && ["Language", labelFor(CODING_LANGUAGES, form.coding_language || "python")],
    ["Topics", form.focus_topics.length ? form.focus_topics.map(topicLabel).join(", ") : "A mix across your role"],
    form.company?.trim() && ["Company", form.company.trim()],
  ].filter(Boolean);
  const said = sentence(form);

  return (
    <aside aria-label="Your interview" className="xl:sticky xl:top-24">
      <SpotlightCard glow="steel" innerClassName="p-5 sm:p-6">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-10 h-40 bg-[radial-gradient(50%_100%_at_50%_0%,rgb(124_147_181/0.16),transparent)]" />
        <div className="relative flex items-center gap-3">
          <InterviewerAvatar size="size-11" active={starting} />
          <div>
            <p className="text-sm font-semibold tracking-wide text-steel">VERA</p>
            <p className="text-xs text-muted">Your interviewer</p>
          </div>
          <span className="ml-auto rounded-full border border-border-strong bg-raised px-2.5 py-1 text-xs text-muted">{presetTitle || "Custom"}</span>
        </div>

        <div className="relative mt-5 min-h-[5.5rem]">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={said} initial={{ opacity: 0, y: 6, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -4, filter: "blur(4px)" }} transition={{ duration: 0.25 }}
              className="text-[17px] leading-snug text-foreground" aria-live="polite">
              {said}
            </motion.p>
          </AnimatePresence>
        </div>

        <dl className="relative mt-4 divide-y divide-border border-y border-border text-sm">
          {rows.map(([term, detail]) => (
            <div key={term} className="flex gap-4 py-2.5">
              <dt className="w-20 shrink-0 text-muted">{term}</dt>
              <dd className="min-w-0 text-foreground">{detail}</dd>
            </div>
          ))}
        </dl>

        {error && <div className="relative mt-4"><Alert tone="error">{error}</Alert></div>}

        <Button type="submit" size="lg" loading={starting} className="group relative mt-6 w-full">
          {starting ? "VERA is getting ready…" : "Take the seat"}
          {!starting && <ArrowRightIcon className="size-4 transition-transform group-hover:translate-x-0.5" />}
        </Button>
        <p className="relative mt-3 text-center text-xs text-muted">
          {coding ? "Code runs in an isolated sandbox, separate from the app." : "Answers are typed. Voice is coming soon."}
        </p>
      </SpotlightCard>
    </aside>
  );
}
