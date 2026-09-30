"use client";

import { motion } from "motion/react";

import NumberTicker from "@/components/motion/NumberTicker";
import Reveal from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";
import SpotlightCard from "@/components/ui/SpotlightCard";

const TOPICS = [["DSA", 8.4], ["System design", 5.6], ["DBMS", 7.2], ["Behavioural", 7.9]];
const EASE = [0.16, 1, 0.3, 1];

/** A score ring that draws itself when scrolled into view. */
function ScoreRing({ value }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth="6" />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke="var(--primary)" strokeWidth="6" strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: c * (1 - value / 10) }}
          viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tracking-tight"><NumberTicker value={value} decimals={1} /></span>
        <span className="text-xs text-muted">out of 10</span>
      </div>
    </div>
  );
}

/** What a report looks like, with sample data, clearly labelled as a sample. */
export default function SampleReport() {
  return (
    <section id="report" className="mx-auto max-w-7xl scroll-mt-16 px-5 py-20 sm:px-6 md:py-32" aria-labelledby="report-title">
      <div className="grid items-center gap-10 md:gap-14 lg:grid-cols-[1fr_1.2fr]">
        <Reveal>
          <p className="eyebrow">The report</p>
          <SplitHeading id="report-title" text="Feedback you can act on *tonight.*" className="section-title mt-4" />
          <p className="mt-5 max-w-md text-lg text-muted">
            Scores are computed from each answer, not guessed. Every report says what went well, what cost you marks, and the
            one thing to practise next, with the evidence from your own words.
          </p>
        </Reveal>

        <Reveal delay={0.1}>
          <SpotlightCard glow="primary" innerClassName="p-6 sm:p-7 md:p-9">
            <span className="absolute right-6 top-6 rounded-full border border-border-strong px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider text-muted">
              Sample
            </span>
            <div className="flex flex-wrap items-center gap-6 sm:gap-8">
              <ScoreRing value={7.3} />
              <div>
                <p className="text-sm text-muted">Technical interview · 5 questions · 24 min</p>
                <p className="mt-1 text-2xl font-semibold">Solid, with one clear gap</p>
                <p className="mt-2 text-sm text-muted">Strong on algorithms; system design answers stopped at the happy path.</p>
              </div>
            </div>

            <ul className="mt-8 space-y-3">
              {TOPICS.map(([label, value], i) => (
                <li key={label} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm sm:grid-cols-[7.5rem_1fr_2.5rem]">
                  <span className="text-muted">{label}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-border">
                    <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} whileInView={{ width: `${value * 10}%` }}
                      viewport={{ once: true }} transition={{ duration: 1.2, delay: 0.3 + i * 0.1, ease: EASE }} />
                  </span>
                  <span className="text-right font-mono text-xs">{value.toFixed(1)}</span>
                </li>
              ))}
            </ul>

            <div className="mt-8 grid gap-4 border-t border-border pt-6 text-sm sm:grid-cols-2">
              <div>
                <p className="flex items-center gap-2 font-medium"><span className="text-success" aria-hidden="true">✓</span> Went well</p>
                <p className="mt-1 text-muted">Clear complexity analysis; tested edge cases unprompted.</p>
              </div>
              <div>
                <p className="flex items-center gap-2 font-medium"><span className="text-warning" aria-hidden="true">!</span> To fix</p>
                <p className="mt-1 text-muted">Cache misses and hot keys never came up. Drill system design.</p>
              </div>
            </div>
          </SpotlightCard>
        </Reveal>
      </div>
    </section>
  );
}
