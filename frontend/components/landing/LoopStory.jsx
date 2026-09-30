"use client";

import { AnimatePresence, motion, useInView } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { InterviewerAvatar, MentorAvatar } from "@/components/brand/AgentAvatar";
import NumberTicker from "@/components/motion/NumberTicker";
import Reveal from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";
import SpotlightCard from "@/components/ui/SpotlightCard";

const EASE = [0.16, 1, 0.3, 1];

// ── The four visuals (plain HTML; sample content) ───────────────────────────────────────────────────────

function Panel({ glow, className = "", children }) {
  return <SpotlightCard glow={glow} className="w-full max-w-md" innerClassName={`p-6 ${className}`}>{children}</SpotlightCard>;
}

const QUESTION = "Walk me through how you'd design a URL shortener. Start with the read path: what happens when someone opens a short link?";

function useTypewriter(text, speed = 22) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const id = requestAnimationFrame(() => setCount(text.length));
      return () => cancelAnimationFrame(id);
    }
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return text.slice(0, count);
}

function InterviewVisual() {
  const typed = useTypewriter(QUESTION);
  return (
    <Panel glow="steel">
      <div className="flex items-center gap-3">
        <InterviewerAvatar active size="size-9" />
        <div className="text-sm">
          <p className="font-semibold text-steel">VERA</p>
          <p className="text-xs text-muted">System design · question 2 of 5</p>
        </div>
        <span className="ml-auto font-mono text-xs text-muted">04:12</span>
      </div>
      <p className="mt-5 min-h-24 text-[15px] leading-relaxed">
        {typed}
        <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-pulse bg-steel" />
      </p>
      <div className="mt-5 rounded-xl border border-border bg-background/60 p-4 text-sm text-subtle">Your answer…</div>
    </Panel>
  );
}

const DIMENSIONS = [["Correctness", 8.2], ["Depth", 6.4], ["Communication", 7.9], ["Trade-offs", 5.1]];

function EvaluateVisual() {
  return (
    <Panel glow="primary">
      <div className="flex items-end justify-between">
        <div>
          <p className="text-xs text-muted">This answer</p>
          <p className="mt-1 text-5xl font-semibold tracking-tight"><NumberTicker value={7.1} decimals={1} /></p>
        </div>
        <span className="rounded-full bg-raised px-2.5 py-1 text-xs text-muted">adequate · follow-up next</span>
      </div>
      <ul className="mt-6 space-y-3">
        {DIMENSIONS.map(([label, value], i) => (
          <li key={label} className="grid grid-cols-[7rem_1fr_2rem] items-center gap-3 text-sm">
            <span className="text-muted">{label}</span>
            <span className="h-1.5 overflow-hidden rounded-full bg-border">
              <motion.span className="block h-full rounded-full bg-primary" initial={{ width: 0 }} animate={{ width: `${value * 10}%` }}
                transition={{ duration: 1, delay: 0.2 + i * 0.1, ease: EASE }} />
            </span>
            <span className="text-right font-mono text-xs">{value.toFixed(1)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-5 border-t border-border pt-4 text-sm text-muted">
        <span className="text-foreground">To improve:</span> you named a cache but not what happens on a miss.
      </p>
    </Panel>
  );
}

function HandoffVisual() {
  return (
    <Panel glow="neutral">
      <div className="flex items-center justify-between">
        <div className="flex flex-col items-center gap-2 text-xs"><InterviewerAvatar size="size-14" /><span className="font-semibold text-steel">VERA</span></div>
        <div className="relative mx-4 h-px flex-1 bg-gradient-to-r from-steel/60 to-primary/60">
          <motion.div className="absolute -top-3 h-6 w-5 rounded-[3px] border border-border-strong bg-[#b9b4aa] shadow-[0_0_20px_-4px_var(--primary)]"
            animate={{ left: ["0%", "88%"] }} transition={{ duration: 2.2, repeat: Infinity, repeatDelay: 0.6, ease: "easeInOut" }} />
        </div>
        <div className="flex flex-col items-center gap-2 text-xs"><MentorAvatar active size="size-14" /><span className="font-semibold text-primary">ARIA</span></div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2 text-center">
        {[["7.4", "overall"], ["3", "strengths"], ["2", "to fix"]].map(([v, l]) => (
          <div key={l} className="rounded-lg bg-background/60 py-3"><p className="text-xl font-semibold">{v}</p><p className="text-[11px] text-muted">{l}</p></div>
        ))}
      </div>
      <p className="mt-4 text-center text-sm text-muted">VERA has passed your report to ARIA.</p>
    </Panel>
  );
}

function MentorVisual() {
  const bubble = { hidden: { opacity: 0, y: 10 }, shown: (i) => ({ opacity: 1, y: 0, transition: { delay: 0.2 + i * 0.5, duration: 0.5, ease: EASE } }) };
  return (
    <Panel glow="primary" className="space-y-3 text-sm">
      <motion.div custom={0} variants={bubble} initial="hidden" animate="shown"
        className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-tr-sm border border-border-strong bg-raised px-4 py-2.5">
        Why did I lose marks on system design?
      </motion.div>
      <motion.div custom={1} variants={bubble} initial="hidden" animate="shown" className="max-w-[92%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3">
        <p className="mb-2 flex items-center gap-2 text-xs"><MentorAvatar size="size-5" /><span className="font-semibold text-primary">ARIA</span></p>
        In both sessions you described the happy path well, but skipped cache misses and hot keys
        <span className="ml-1 rounded bg-steel-soft px-1.5 py-0.5 font-mono text-[10px] text-steel">[1]</span>
        <span className="ml-1 rounded bg-steel-soft px-1.5 py-0.5 font-mono text-[10px] text-steel">[2]</span>. Let&apos;s drill exactly that.
      </motion.div>
      <motion.div custom={2} variants={bubble} initial="hidden" animate="shown">
        <span className="inline-flex h-8 items-center rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground">
          Start a drill · System design
        </span>
      </motion.div>
    </Panel>
  );
}

const STEPS = [
  { title: "VERA interviews you", body: "Technical, behavioural and live-coding rounds that adapt to how you answer. When an answer is thin, she follows up. Serious mode feels like the real thing.", Visual: InterviewVisual },
  { title: "Every answer is scored, honestly", body: "Correctness, depth, communication and trade-offs, and for code, real test runs. Not one vague number: what went well and exactly what to fix.", Visual: EvaluateVisual },
  { title: "Your report goes to ARIA", body: "A structured report lands on your desk, with the evidence from your own answers. ARIA reads every one of them.", Visual: HandoffVisual },
  { title: "ARIA turns it into your next move", body: "Ask her anything about your interviews. She answers from your reports with citations, then sends you into a drill on your weakest topic.", Visual: MentorVisual },
];

function Step({ index, step, active, onActive }) {
  const ref = useRef(null);
  const inView = useInView(ref, { margin: "-45% 0px -45% 0px" });
  useEffect(() => {
    if (inView) onActive(index);
  }, [inView, index, onActive]);

  return (
    <div ref={ref} className="flex flex-col justify-center py-10 md:min-h-[70svh] md:py-0">
      {/* On phones the visual sits with its step; on desktop it's pinned beside the text */}
      <div className="mb-8 md:hidden"><step.Visual /></div>
      <p className="font-mono text-sm text-primary">0{index + 1}</p>
      <h3 className={`mt-3 text-3xl font-semibold tracking-tight transition-colors duration-500 md:text-4xl ${active ? "text-foreground" : "md:text-subtle"}`}>
        {step.title}
      </h3>
      <p className={`mt-4 max-w-md text-lg leading-relaxed transition-colors duration-500 ${active ? "text-muted" : "md:text-subtle"}`}>{step.body}</p>
    </div>
  );
}

/** The loop, told as you scroll: each step's text passes by while its live visual stays pinned beside it. */
export default function LoopStory() {
  const [active, setActive] = useState(0);
  const Visual = STEPS[active].Visual;

  return (
    <section id="loop" className="relative mx-auto max-w-7xl scroll-mt-16 px-5 py-20 sm:px-6 md:py-32" aria-labelledby="loop-title">
      <Reveal className="max-w-2xl">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">The loop</p>
        <SplitHeading id="loop-title" text="Interview. Evaluate. *Reflect.* Improve." className="section-title mt-4" />
        <p className="mt-4 text-lg text-muted">Every session makes the next one better, because nothing you do is forgotten.</p>
      </Reveal>

      <div className="mt-10 grid gap-0 md:mt-16 md:grid-cols-2 md:gap-16">
        <div className="relative hidden md:block">
          <div className="sticky top-0 flex h-svh items-center justify-center">
            <div aria-hidden="true" className="absolute size-[28rem] rounded-full bg-[radial-gradient(closest-side,rgb(255_122_46/0.1),transparent)] blur-2xl" />
            <AnimatePresence mode="wait">
              <motion.div key={active} className="relative flex w-full justify-center"
                initial={{ opacity: 0, y: 24, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -24, filter: "blur(6px)" }} transition={{ duration: 0.5, ease: EASE }}>
                <Visual />
              </motion.div>
            </AnimatePresence>
            <ol aria-hidden="true" className="absolute bottom-16 flex gap-2">
              {STEPS.map((s, i) => (
                <li key={s.title} className={`h-1 rounded-full transition-all duration-500 ${i === active ? "w-8 bg-primary" : "w-3 bg-border-strong"}`} />
              ))}
            </ol>
          </div>
        </div>
        <div>
          {STEPS.map((step, i) => <Step key={step.title} index={i} step={step} active={i === active} onActive={setActive} />)}
        </div>
      </div>
    </section>
  );
}
