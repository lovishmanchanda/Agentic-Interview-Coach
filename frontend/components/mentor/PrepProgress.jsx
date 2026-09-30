"use client";

import { motion } from "motion/react";
import { useEffect, useState } from "react";

import { CheckIcon } from "@/components/ui/icons";

// The server runs these in order (backend app/agents/prep/orchestrator.py); a plan takes a few seconds to ~20 s.
const STEPS = ["Looking up the company", "Reading the job description", "Checking your interview history",
  "Finding your gaps", "Writing your plan"];
const STEP_MS = 2500;

/**
 * What ARIA is doing while she builds a preparation plan, as a timeline: finished steps ticked, the current one
 * glowing, the rest waiting, and the rail between them filling as she goes. Stays on the last step until the
 * reply arrives (the steps are paced on the client; the server reports only the finished plan).
 */
export default function PrepProgress({ withJd = true }) {
  const steps = withJd ? STEPS : STEPS.filter((s) => !s.includes("job description"));
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), STEP_MS);
    return () => clearInterval(id);
  }, [steps.length]);

  return (
    <div className="min-w-60" role="status" aria-label={`ARIA is preparing your plan: ${steps[index]}`}>
      <p className="mb-3 text-sm"><span className="font-medium">ARIA</span> <span className="text-muted">is preparing your plan</span></p>
      <ol className="relative space-y-3" aria-hidden="true">
        <span className="absolute bottom-2 left-[9px] top-2 w-px bg-border" />
        <motion.span className="absolute left-[9px] top-2 w-px origin-top bg-primary"
          initial={false} animate={{ height: `calc(${(index / (steps.length - 1)) * 100}% - 1rem)` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
        {steps.map((step, i) => {
          const state = i < index ? "done" : i === index ? "now" : "next";
          return (
            <li key={step} className="relative flex items-center gap-3 text-xs">
              <span className={`relative flex size-[19px] shrink-0 items-center justify-center rounded-full border transition-colors duration-300 ${
                state === "done" ? "border-success/50 bg-success-soft text-success"
                  : state === "now" ? "border-primary bg-primary-soft" : "border-border-strong bg-surface"}`}>
                {state === "done" && <CheckIcon className="size-3" strokeWidth={2.6} />}
                {state === "now" && (
                  <>
                    <span className="size-1.5 rounded-full bg-primary" />
                    <span className="absolute inset-0 animate-ping rounded-full border border-primary/60" />
                  </>
                )}
              </span>
              <span className={state === "next" ? "text-subtle" : state === "now" ? "text-foreground" : "text-muted"}>
                {step}{state === "now" ? "…" : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
