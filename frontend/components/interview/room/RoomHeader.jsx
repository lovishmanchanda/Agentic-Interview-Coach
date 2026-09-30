"use client";

import { motion } from "motion/react";

import { InterviewerAvatar } from "@/components/brand/AgentAvatar";
import Button from "@/components/ui/Button";
import Spinner from "@/components/ui/Spinner";

import { ElapsedClock } from "../QuestionTimer";

const pad = (n) => String(n).padStart(2, "0");

/** One segment per main question: done ones solid orange, the current one glowing, the rest empty. */
function QuestionProgress({ asked, total, followUp, finished }) {
  if (!total) return null;
  const current = Math.max(1, asked || 1);
  return (
    <div className="flex items-center gap-3">
      <ol className="flex flex-1 gap-1.5" aria-label={finished ? `All ${total} questions answered` : `Question ${current} of ${total}${followUp ? ", follow-up" : ""}`}>
        {Array.from({ length: total }, (_, i) => {
          const done = finished || i + 1 < current;
          const now = !finished && i + 1 === current;
          return (
            <li key={i} className="relative h-1 flex-1 overflow-hidden rounded-full bg-border">
              <motion.span className={`absolute inset-y-0 left-0 rounded-full ${now ? "bg-primary/50" : "bg-primary"}`}
                initial={false} animate={{ width: done || now ? "100%" : "0%" }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
              {now && (
                <motion.span aria-hidden="true" className="absolute inset-y-0 w-1/2 bg-[linear-gradient(90deg,transparent,rgb(255_255_255/0.4),transparent)]"
                  initial={{ x: "-100%" }} animate={{ x: "220%" }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }} />
              )}
            </li>
          );
        })}
      </ol>
      <span aria-hidden="true" className="font-mono text-xs tabular-nums text-muted">
        {pad(finished ? total : current)}<span className="text-subtle"> / {pad(total)}</span>
        {followUp && !finished && <span className="ml-1.5 text-steel">+ follow-up</span>}
      </span>
    </div>
  );
}

/**
 * The top of the interview room: VERA (lit while she's thinking), what kind of interview this is, how far
 * along you are, and a way out (the interview is saved; it resumes from your desk).
 */
export default function RoomHeader({ title, meta, busy, connection, progress, finished, elapsedSince, clockOffset }) {
  return (
    <header className="space-y-4">
      <div className="flex items-center gap-3">
        <InterviewerAvatar size="size-11" active={busy} />
        <div className="min-w-0 flex-1">
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{title}</h1>
          <p className="truncate text-xs text-muted sm:text-sm">{meta}</p>
        </div>
        {connection && <Spinner label={connection} className="size-4" />}
        {elapsedSince && !finished && (
          <span className="text-xs text-muted max-sm:hidden"><ElapsedClock since={elapsedSince} clockOffsetMs={clockOffset} /> in</span>
        )}
        {!finished && (
          <Button href="/dashboard" variant="ghost" size="sm" title="Your answers so far are saved. Resume from your desk.">
            Leave
          </Button>
        )}
      </div>
      <QuestionProgress asked={progress?.asked} total={progress?.total} followUp={progress?.followUp} finished={finished} />
    </header>
  );
}
