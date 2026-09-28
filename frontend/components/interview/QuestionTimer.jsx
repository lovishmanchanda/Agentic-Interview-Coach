"use client";

import { useEffect, useState } from "react";

import { formatDuration } from "@/lib/format";

/**
 * Time on the current question, from the server's asked_at (corrected by the client's clock offset), so a
 * reload doesn't reset it. The suggested time is a guide, not a limit: past it the timer says so in words
 * as well as colour.
 */
export default function QuestionTimer({ askedAt, suggestedSeconds, clockOffsetMs = 0, stopped = false, compact = false }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (stopped || !askedAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [askedAt, stopped]);

  if (!askedAt) return null;
  const elapsed = Math.max(0, Math.round((now + clockOffsetMs - new Date(askedAt).getTime()) / 1000));
  const over = suggestedSeconds && elapsed > suggestedSeconds;
  const fraction = suggestedSeconds ? Math.min(1, elapsed / suggestedSeconds) : 0;

  return (
    <div className={compact ? "text-xs" : "text-sm"} role="timer" aria-live="off"
      aria-label={`${formatDuration(elapsed)} on this question${suggestedSeconds ? `, suggested about ${formatDuration(suggestedSeconds)}` : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className={`font-semibold tabular-nums ${over ? "text-warning" : "text-foreground"}`}>{formatDuration(elapsed)}</span>
        {suggestedSeconds ? (
          <span className="text-muted">{over ? "over the suggested time" : `aim for ~${Math.round(suggestedSeconds / 60)} min`}</span>
        ) : null}
      </div>
      {suggestedSeconds && !compact ? (
        <div aria-hidden className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-primary-soft">
          <div className={`h-full rounded-full ${over ? "bg-warning" : "bg-chart-mark"}`} style={{ width: `${fraction * 100}%` }} />
        </div>
      ) : null}
    </div>
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
  return <p className="tabular-nums" aria-label={`${formatDuration(elapsed)} elapsed`}>{formatDuration(elapsed)} elapsed</p>;
}
