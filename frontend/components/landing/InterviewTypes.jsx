"use client";

import { motion } from "motion/react";

import Reveal, { Stagger, StaggerItem } from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";
import SpotlightCard from "@/components/ui/SpotlightCard";

const CODE = [
  "def two_sum(nums, target):",
  "    seen = {}",
  "    for i, n in enumerate(nums):",
  "        if target - n in seen:",
  "            return [seen[target - n], i]",
  "        seen[n] = i",
];
const KEYWORD = /(\bdef\b|\bfor\b|\bin\b|\bif\b|\breturn\b)/;

/** One line of Python, keywords in the brand orange. */
function CodeLine({ text }) {
  return (
    <div className="whitespace-pre">
      {text.split(KEYWORD).map((part, i) => (
        <span key={i} className={KEYWORD.test(part) ? "text-primary" : "text-muted"}>{part}</span>
      ))}
    </div>
  );
}

function Card({ className = "", eyebrow, title, body, children }) {
  return (
    <StaggerItem className={className}>
      <SpotlightCard as={motion.article} whileHover={{ y: -4 }} transition={{ duration: 0.3 }} glow="primary"
        className="group h-full" innerClassName="flex flex-col p-6 sm:p-7">
        <p className="eyebrow">{eyebrow}</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight">{title}</h3>
        <p className="mt-2 max-w-md text-muted">{body}</p>
        {children && <div className="mt-6 flex-1">{children}</div>}
      </SpotlightCard>
    </StaggerItem>
  );
}

/** What you can practise, as a bento grid. */
export default function InterviewTypes() {
  return (
    <section className="mx-auto max-w-7xl px-5 py-20 sm:px-6 md:py-32" aria-labelledby="types-title">
      <Reveal className="max-w-2xl">
        <p className="eyebrow">What you can practise</p>
        <SplitHeading id="types-title" text="Every round of the *real thing.*" className="section-title mt-4" />
      </Reveal>
      <Stagger className="mt-10 grid gap-5 md:mt-14 md:grid-cols-3">
        <Card className="md:col-span-2" eyebrow="Technical" title="Concepts, under pressure"
          body="DSA, system design, databases, operating systems, OOP, machine learning. Questions pitched to your level and role, with follow-ups that dig.">
          <div className="flex flex-wrap gap-2">
            {["DSA", "System design", "DBMS", "Operating systems", "OOP", "Python", "Machine learning"].map((t) => (
              <span key={t} className="rounded-full border border-border px-3 py-1 text-sm text-muted transition-colors group-hover:border-border-strong">{t}</span>
            ))}
          </div>
        </Card>
        <Card eyebrow="Behavioural" title="Stories that land"
          body="Scored on STAR: situation, task, action, result. Vague results get called out.">
          <div className="grid grid-cols-4 gap-1.5">
            {["S", "T", "A", "R"].map((l, i) => (
              <div key={l} className="flex aspect-square items-center justify-center rounded-xl border border-border font-mono text-lg"
                style={{ opacity: 0.45 + i * 0.18 }}>{l}</div>
            ))}
          </div>
        </Card>
        <Card eyebrow="Live coding" title="Code that actually runs"
          body="Write in the editor, run the visible tests, submit. Hidden tests decide the score.">
          <pre className="overflow-x-auto rounded-xl border border-border bg-background p-4 font-mono text-[11px] leading-relaxed sm:text-[12px]">
            {CODE.map((line) => <CodeLine key={line} text={line} />)}
            <div className="mt-2 text-success">✓ 12 of 12 tests passed</div>
          </pre>
        </Card>
        <Card className="md:col-span-2" eyebrow="Company prep" title="Aim at a specific company"
          body="Name the company and paste the job description. ARIA researches how they interview, compares it with your scores, and writes a week-by-week plan with practice rounds built in.">
          <div className="grid gap-2 sm:grid-cols-3">
            {[["Week 1", "System design basics", "2 drills"], ["Week 2", "Behavioural: ownership", "1 mock"], ["Week 3", "Full mock interview", "serious mode"]].map(([w, t, d]) => (
              <div key={w} className="rounded-xl border border-border bg-background/50 p-4">
                <p className="font-mono text-xs text-primary">{w}</p>
                <p className="mt-1 text-sm">{t}</p>
                <p className="text-xs text-muted">{d}</p>
              </div>
            ))}
          </div>
        </Card>
      </Stagger>
    </section>
  );
}
