"use client";

import { AnimatePresence, motion } from "motion/react";
import { useId, useState } from "react";

import Reveal from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";

const FAQ = [
  ["What does VERA ask?", "Questions for your target role and level: technical (DSA, system design, databases, OS, OOP and more), behavioural in STAR form, and live coding problems you solve in an editor. She follows up when an answer is incomplete and moves on when it's solid."],
  ["How are answers scored?", "Each answer is evaluated on several dimensions, such as correctness, depth and communication, or STAR for behavioural answers. Coding answers are run against tests, visible and hidden. Report scores are computed from those evaluations, not written by the AI."],
  ["What does ARIA know about me?", "Only your own reports and your conversations with her. She answers from them and cites the sessions she used. She never sees anyone else's interviews."],
  ["What's the difference between practice and serious mode?", "Practice shows feedback after every answer and offers hints. Serious mode behaves like a real interview: no hints, no scores until the report at the end."],
  ["How is AI used, and what's stored?", "An AI model asks the questions, evaluates your answers, writes parts of your report and powers ARIA. We store your profile, interviews, answers, reports and conversations with ARIA so the loop can work."],
  ["Will this replace a real mock interview?", "No, and it isn't meant to. It gives you as many honest practice rounds as you want, so the real ones go better."],
];

function Item({ q, a, open, onToggle }) {
  const id = useId();
  return (
    <li className="border-b border-border">
      <h3>
        <button type="button" onClick={onToggle} aria-expanded={open} aria-controls={id}
          className="flex w-full items-center justify-between gap-6 py-5 text-left text-base transition-colors hover:text-foreground sm:py-6 sm:text-lg">
          <span className={open ? "text-foreground" : "text-foreground/90"}>{q}</span>
          <motion.span aria-hidden="true" animate={{ rotate: open ? 45 : 0 }} transition={{ duration: 0.3 }}
            className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-strong text-muted">+</motion.span>
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div id={id} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
            <p className="max-w-2xl pb-6 text-muted">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="mx-auto max-w-4xl scroll-mt-16 px-5 py-20 sm:px-6 md:py-32" aria-labelledby="faq-title">
      <Reveal>
        <p className="eyebrow">Questions</p>
        <SplitHeading id="faq-title" text="Before you take the *seat.*" className="section-title mt-4" />
      </Reveal>
      <ul className="mt-10 border-t border-border">
        {FAQ.map(([q, a], i) => <Item key={q} q={q} a={a} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />)}
      </ul>
    </section>
  );
}
