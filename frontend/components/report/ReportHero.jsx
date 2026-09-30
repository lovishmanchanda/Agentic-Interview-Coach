"use client";

import { motion } from "motion/react";

import { tierFor } from "@/components/charts/ScoreBars";
import SplitHeading from "@/components/motion/SplitHeading";
import Button from "@/components/ui/Button";
import ProgressRing from "@/components/ui/ProgressRing";

const HEADLINE = { strong: "A *strong* showing.", adequate: "Solid, with *gaps.*", weak: "Room to *grow.*" };
const RING_TONE = { strong: "success", adequate: "steel", weak: "warning" };

/**
 * The top of the report: the one hero number (a ring that draws and counts up), a headline in words for its
 * tier, what kind of interview it was, VERA's summary, the sub-scores, and what to do about it.
 * Lit from the top left by VERA's cool light: she wrote this page.
 */
export default function ReportHero({ overall, subScores, eyebrow, meta, summary, sourceNote, actions }) {
  const tier = tierFor(overall);
  return (
    <section aria-labelledby="report-title" className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-10">
      <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-32 h-80 w-[36rem] rotate-[-18deg] bg-[radial-gradient(closest-side,rgb(124_147_181/0.16),transparent)] print:hidden" />
      <div className="relative grid items-center gap-8 md:grid-cols-[auto_minmax(0,1fr)] md:gap-12">
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          className="justify-self-start">
          <ProgressRing value={overall} size="size-36 sm:size-44" stroke={7} caption="out of 10" tone={RING_TONE[tier]}
            label={`Overall ${overall} out of 10, ${tier}`} />
        </motion.div>

        <div className="min-w-0">
          <p className="eyebrow">{eyebrow}</p>
          <SplitHeading as="h1" id="report-title" text={HEADLINE[tier]} animateOnMount delay={0.1}
            className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl" />
          {meta && <p className="mt-3 text-sm text-muted">{meta}</p>}

          {subScores.length > 0 && (
            <dl className="mt-5 flex flex-wrap gap-2">
              {subScores.map(({ label, value }) => (
                <div key={label} className="flex items-baseline gap-2 rounded-full border border-border-strong bg-background/50 px-3 py-1 text-xs">
                  <dt className="text-muted">{label}</dt>
                  <dd className="font-mono font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </div>

      {summary && (
        <div className="relative mt-8 border-t border-border pt-6">
          <p className="mb-2 flex items-center gap-2 text-xs"><span className="font-semibold tracking-wide text-steel">VERA</span><span className="text-muted">· in summary</span></p>
          <p className="max-w-3xl text-[15px] leading-relaxed sm:text-base">{summary}</p>
          {sourceNote && <p className="mt-3 text-xs text-subtle">{sourceNote}</p>}
        </div>
      )}

      {actions?.length > 0 && (
        <div className="relative mt-6 flex flex-wrap gap-3 print:hidden">
          {actions.map(({ label, href, onClick, variant, title, Icon }) => (
            <Button key={label} href={href} onClick={onClick} variant={variant} title={title}>
              {Icon && <Icon className="size-4" />}{label}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
