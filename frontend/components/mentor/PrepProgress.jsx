"use client";

import { useEffect, useState } from "react";

import Spinner from "@/components/ui/Spinner";

// The server runs these in order (backend app/agents/prep/orchestrator.py); a plan takes a few seconds to ~20 s.
const STEPS = ["Looking up the company…", "Reading the job description…", "Checking your interview history…",
  "Finding your gaps…", "Writing your plan…"];
const STEP_MS = 2500;

/** What the Mentor is doing while it builds a preparation plan. Stays on the last step until the reply arrives. */
export default function PrepProgress({ withJd = true }) {
  const steps = withJd ? STEPS : STEPS.filter((s) => !s.includes("job description"));
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setIndex((i) => Math.min(i + 1, steps.length - 1)), STEP_MS);
    return () => clearInterval(id);
  }, [steps.length]);
  return (
    <div className="space-y-1.5">
      <Spinner label={steps[index]} />
      <ol className="space-y-0.5 pl-1 text-xs text-muted" aria-hidden>
        {steps.slice(0, index).map((s) => <li key={s}>✓ {s.replace("…", "")}</li>)}
      </ol>
    </div>
  );
}
