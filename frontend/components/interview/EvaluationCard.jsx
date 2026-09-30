"use client";

import { motion } from "motion/react";

import Badge from "@/components/ui/Badge";
import { ArrowRightIcon, CheckIcon, ChevronDownIcon } from "@/components/ui/icons";
import ProgressRing from "@/components/ui/ProgressRing";
import { dimensionLabel } from "@/lib/interviewOptions";

const TIER_TONE = { strong: "success", adequate: "neutral", weak: "warning" }; // orange stays for actions
const EASE = [0.16, 1, 0.3, 1];
const ITEM = { hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0, transition: { duration: 0.5, ease: EASE } } };

function List({ title, items, Icon, tone }) {
  if (!items?.length) return null;
  return (
    <motion.div variants={ITEM}>
      <p className={`text-xs font-semibold uppercase tracking-wider ${tone}`}>{title}</p>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <Icon className={`mt-0.5 size-4 shrink-0 ${tone}`} />
            <span className="leading-relaxed">{item}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

/**
 * VERA's verdict on one answer: a score ring that draws and counts up, the tier in words, the dimension
 * scores as small bars, what worked and what didn't, the next step, and (folded) what a strong answer covers.
 * The parts arrive one after another; with reduced motion they're simply there.
 */
export default function EvaluationCard({ evaluation }) {
  const { overall_score, performance_tier, dimensions, strengths, weaknesses, feedback, suggestion, model_answer_outline } = evaluation;
  const tone = TIER_TONE[performance_tier] || "neutral";
  return (
    <motion.div initial="hidden" whileInView="shown" viewport={{ once: true }} transition={{ staggerChildren: 0.09 }}
      className="space-y-5 rounded-2xl border border-border bg-background/50 p-5">
      <motion.div variants={ITEM} className="flex items-center gap-4 sm:gap-5">
        <ProgressRing value={overall_score} size="size-20" stroke={8} caption="/ 10"
          tone={tone === "neutral" ? "steel" : tone} label={`Scored ${overall_score} out of 10, ${performance_tier}`} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-xs text-muted">
            <span className="font-semibold tracking-wide text-steel">VERA</span> evaluated your answer
            <Badge tone={tone} dot>{performance_tier}</Badge>
          </p>
          {feedback && <p className="mt-2 text-sm leading-relaxed">{feedback}</p>}
        </div>
      </motion.div>

      {dimensions && Object.keys(dimensions).length > 0 && (
        // technical: correctness · depth · communication; behavioral: the STAR parts, specificity, ownership…
        <motion.ul variants={ITEM} className="grid gap-x-6 gap-y-3 sm:grid-cols-2" aria-label="Scores by dimension">
          {Object.entries(dimensions).map(([name, score]) => (
            <li key={name} className="text-xs">
              <span className="flex justify-between gap-2">
                <span className="text-muted">{dimensionLabel(name)}</span>
                <span className="font-mono tabular-nums">{score}</span>
              </span>
              <span aria-hidden="true" className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-raised">
                <motion.span className="block h-full rounded-full bg-chart-mark" initial={{ width: 0 }}
                  whileInView={{ width: `${Math.max(0, Math.min(10, score)) * 10}%` }} viewport={{ once: true }}
                  transition={{ duration: 0.9, delay: 0.3, ease: EASE }} />
              </span>
            </li>
          ))}
        </motion.ul>
      )}

      {(strengths?.length > 0 || weaknesses?.length > 0) && (
        <div className="grid gap-5 sm:grid-cols-2">
          <List title="What worked" items={strengths} Icon={CheckIcon} tone="text-success" />
          <List title="To improve" items={weaknesses} Icon={ArrowRightIcon} tone="text-warning" />
        </div>
      )}

      {suggestion && (
        <motion.p variants={ITEM} className="rounded-xl border border-primary/25 bg-primary-soft/40 px-4 py-3 text-sm leading-relaxed">
          <span className="font-medium text-primary">Next step · </span>{suggestion}
        </motion.p>
      )}

      {model_answer_outline?.length > 0 && (
        <motion.details variants={ITEM} className="group rounded-xl border border-border px-4 py-3">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
            What a strong answer covers
            <ChevronDownIcon className="size-4 text-muted transition-transform group-open:rotate-180" />
          </summary>
          <ul className="mt-3 space-y-1.5 text-sm text-muted">
            {model_answer_outline.map((item) => (
              <li key={item} className="flex gap-2"><span aria-hidden="true" className="text-subtle">—</span><span>{item}</span></li>
            ))}
          </ul>
        </motion.details>
      )}
    </motion.div>
  );
}
