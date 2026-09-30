"use client";

import { useEffect, useState } from "react";

import { formatDuration } from "@/lib/format";

const R = 9;
const C = 2 * Math.PI * R;

/**
 * Time on the current question, from the server's asked_at (corrected by the client's clock offset), so a
 * reload doesn't reset it. A small ring fills toward the suggested time in VERA's steel; the suggestion is a
 * guide, not a limit, so past it the ring turns amber and the words say so too (not colour alone).
 */
export default function QuestionTimer({ askedAt, suggestedSeconds, clockOffsetMs = 0, stopped = false }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stopped || !askedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [askedAt, stopped]);

  if (!askedAt) return null;
  const elapsed = Math.max(0, Math.round((now + clockOffsetMs - new Date(askedAt).getTime()) / 1000));
  const over = Boolean(suggestedSeconds) && elapsed > suggestedSeconds;
  const fraction = suggestedSeconds ? Math.min(1, elapsed / suggestedSeconds) : 0;

  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs" role="timer" aria-live="off"
      aria-label={`${formatDuration(elapsed)} on this question${suggestedSeconds ? `, suggested about ${formatDuration(suggestedSeconds)}` : ""}`}>
      {suggestedSeconds ? (
        <svg viewBox="0 0 24 24" className="size-6 -rotate-90" aria-hidden="true">
          <circle cx="12" cy="12" r={R} fill="none" stroke="var(--border-strong)" strokeWidth="2.5" />
          <circle cx="12" cy="12" r={R} fill="none" stroke={over ? "var(--warning)" : "var(--steel)"} strokeWidth="2.5"
            strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - fraction)}
            className="transition-[stroke-dashoffset] duration-1000 ease-linear" />
        </svg>
      ) : null}
      <span aria-hidden="true" className="flex items-baseline gap-1.5">
        <span className={`font-mono font-medium tabular-nums ${over ? "text-warning" : "text-foreground"}`}>{formatDuration(elapsed)}</span>
        {suggestedSeconds ? (
          <span className="text-muted max-sm:hidden">{over ? "over the suggested time" : `of ~${Math.round(suggestedSeconds / 60)} min`}</span>
        ) : null}
      </span>
    </span>
  );
}

/** Total time in the interview so far, e.g. in the serious-mode header. */
export function ElapsedClock({ since, clockOffsetMs = 0 }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const elapsed = Math.max(0, Math.round((now + clockOffsetMs - new Date(since).getTime()) / 1000));
  return <span className="font-mono tabular-nums" aria-label={`${formatDuration(elapsed)} elapsed`}>{formatDuration(elapsed)}</span>;
}
