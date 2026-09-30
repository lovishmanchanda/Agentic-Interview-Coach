"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

import AgentStatus from "@/components/brand/AgentStatus";
import RevealText from "@/components/motion/RevealText";
import Badge from "@/components/ui/Badge";
import { BulbIcon, ChevronDownIcon } from "@/components/ui/icons";
import Skeleton from "@/components/ui/Skeleton";

import EvaluationCard from "../EvaluationCard";

const EASE = [0.16, 1, 0.3, 1];
const TIER_TONE = { strong: "success", adequate: "neutral", weak: "warning" };
const pad = (n) => String(n).padStart(2, "0");

/**
 * The transcript as rounds: each of VERA's questions (main or follow-up) with what came after it (a hint,
 * your answer, her evaluation). Main questions are numbered; follow-ups hang off the question before.
 * VERA's closing words aren't a round; the page shows them with the finish.
 */
export function groupRounds(transcript) {
  const rounds = [];
  let number = 0;
  transcript.forEach((entry, index) => {
    if (entry.role === "interviewer" && entry.is_closing) return;
    if (entry.role === "interviewer") {
      if (!entry.is_follow_up) number += 1;
      rounds.push({ key: `${entry.question_id}-${index}`, question: entry, number: Math.max(number, 1), entries: [] });
    } else if (rounds.length) {
      rounds[rounds.length - 1].entries.push(entry);
    }
  });
  return rounds.map((r) => ({ ...r, evaluation: r.entries.find((e) => e.role === "evaluation")?.evaluation ?? null }));
}

/** VERA's spotlight falling on the stage from above; it breathes while she's thinking. */
function Beam({ active }) {
  const reduce = useReducedMotion();
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
      <motion.div className="absolute left-1/2 top-0 h-[130%] w-[160%] -translate-x-1/2"
        style={{
          background: "conic-gradient(at 50% 0%, transparent 156deg, rgb(124 147 181 / 0.09) 170deg, rgb(214 224 240 / 0.13) 180deg, rgb(124 147 181 / 0.09) 190deg, transparent 204deg)",
          maskImage: "linear-gradient(to bottom, black, transparent 80%)",
        }}
        animate={active && !reduce ? { opacity: [0.55, 1, 0.55] } : { opacity: 0.8 }}
        transition={active ? { duration: 2.4, repeat: Infinity, ease: "easeInOut" } : { duration: 0.6 }} />
      <div className="absolute left-1/2 top-0 h-px w-48 -translate-x-1/2 bg-gradient-to-r from-transparent via-steel/80 to-transparent" />
    </div>
  );
}

function Hint({ entry }) {
  return (
    <div className="flex gap-3 rounded-2xl border border-dashed border-warning/40 bg-warning-soft/40 px-4 py-3 text-sm">
      <BulbIcon className="mt-0.5 size-4 shrink-0 text-warning" />
      <div>
        <p className="text-xs font-medium text-warning">Hint</p>
        <p className="mt-0.5 whitespace-pre-wrap leading-relaxed">{entry.content}</p>
      </div>
    </div>
  );
}

function Answer({ entry }) {
  return (
    <div className="rounded-2xl border border-border-strong bg-raised/60 px-4 py-3 text-sm">
      <p className="mb-1 text-xs font-medium text-muted">You{entry.code ? ` · ${entry.language} solution` : ""}</p>
      {entry.code && <pre className="mb-2 max-h-72 overflow-auto rounded-lg bg-background p-3 font-mono text-xs">{entry.code}</pre>}
      {entry.content && <p className="whitespace-pre-wrap leading-relaxed">{entry.content}</p>}
    </div>
  );
}

function Entries({ entries, serious }) {
  return entries.map((entry, i) => (
    <motion.div key={`${entry.role}-${i}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: EASE }}>
      {entry.role === "hint" && <Hint entry={entry} />}
      {entry.role === "candidate" && <Answer entry={entry} />}
      {entry.role === "evaluation" && !serious && <EvaluationCard evaluation={entry.evaluation} />}
    </motion.div>
  ));
}

function roundLabel(round, total) {
  if (round.question.is_follow_up) return `Follow-up to question ${round.number}`;
  return total ? `Question ${round.number} of ${total}` : `Question ${round.number}`;
}

/**
 * The question on stage: large, under VERA's light, arriving word by word (serious mode just fades it in).
 * Below it, whatever has happened since: a hint, your answer, VERA thinking, her evaluation.
 */
export function StageRound({ round, total, busyText, serious, questionId }) {
  return (
    <section aria-labelledby={questionId} className="relative rounded-3xl border border-border bg-surface">
      <Beam active={Boolean(busyText)} />
      <div className="relative space-y-5 p-5 sm:p-8">
        <p className="flex items-center gap-2 text-xs">
          <span className="font-semibold tracking-wide text-steel">VERA</span>
          <span className="text-muted">· {roundLabel(round, total)}</span>
        </p>
        <motion.h2 id={questionId} key={round.key} initial={serious ? { opacity: 0 } : false} animate={{ opacity: 1 }}
          transition={{ duration: 0.8 }}
          className="whitespace-pre-wrap text-xl font-medium leading-snug tracking-tight text-foreground sm:text-[1.65rem] sm:leading-[1.3]">
          <RevealText text={round.question.content} animate={!serious} />
        </motion.h2>
        <Entries entries={round.entries} serious={serious} />
        {busyText && <AgentStatus agent="interviewer" text={busyText} />}
      </div>
    </section>
  );
}

/** Before the first question: an empty stage, VERA's light on, the question still being written. */
export function EmptyStage({ busyText }) {
  return (
    <section className="relative rounded-3xl border border-border bg-surface">
      <Beam active />
      <div className="relative space-y-4 p-5 sm:p-8">
        <p className="text-xs"><span className="font-semibold tracking-wide text-steel">VERA</span></p>
        <div className="space-y-3" aria-hidden="true">
          <Skeleton className="h-6 w-11/12" />
          <Skeleton className="h-6 w-8/12" />
        </div>
        {busyText && <AgentStatus agent="interviewer" text={busyText} />}
      </div>
    </section>
  );
}

/**
 * An earlier round, folded to one line (number, the question, the score). Opens in place. The round you
 * were just scored on starts open, so its feedback stays in view while the next question arrives.
 */
export function PastRound({ round, serious, defaultOpen = false }) {
  const [open, setOpen] = useState(null); // null until you toggle it: then your choice sticks
  const expanded = open ?? defaultOpen;
  const score = !serious && round.evaluation ? round.evaluation.overall_score : null;
  const followUp = round.question.is_follow_up;
  return (
    <li className={followUp ? "ml-4 border-l border-steel/30 pl-3 sm:ml-6 sm:pl-4" : ""}>
      <button type="button" onClick={() => setOpen(!expanded)} aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-2xl border border-border bg-surface/60 px-4 py-3 text-left transition-colors hover:border-border-strong hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="w-6 shrink-0 font-mono text-xs text-subtle">{followUp ? "↳" : pad(round.number)}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-muted">
          <span className="sr-only">{roundLabel(round)}: </span>{round.question.content}
        </span>
        {score !== null && <Badge tone={TIER_TONE[round.evaluation.performance_tier] || "neutral"}><span className="font-mono">{score}</span></Badge>}
        <ChevronDownIcon className={`size-4 shrink-0 text-muted transition-transform duration-300 ${expanded ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
            <div className="space-y-3 pb-2 pt-3 sm:pl-9">
              <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{round.question.content}</p>
              <Entries entries={round.entries} serious={serious} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
