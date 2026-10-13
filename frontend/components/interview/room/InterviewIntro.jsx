"use client";

import { animate, motion, useMotionValue } from "motion/react";
import { useEffect, useRef, useState } from "react";

import AgentStatus from "@/components/brand/AgentStatus";
import { useShot } from "@/components/three/shots";

const EASE = [0.16, 1, 0.3, 1];
// The server starts a question's clock when it sends it, so the intro never holds a question back (that time
// would count against the answer): the scene plays while VERA prepares, and when the question arrives the
// camera starts its push-in and the interview screen takes over at once, the room fading out behind it.
// `hold` is the moment of push-in shown first (your first interview only), in ms.
const FULL = { hold: 350, fade: 0.9 };
const QUICK = { hold: 0, fade: 0.45 };

/**
 * The walk into the interview, shown while VERA prepares the first question of a new interview: the room
 * (the site-wide SceneHost) cuts to the interview table, your chair is brought to it, two interviewers wait
 * across it. When the first question arrives, the camera pushes in over your shoulder while the room fades, and
 * the interview screen takes over (`onDone`) straight away: the question's clock is already running.
 *
 *   full        your first interview ("Take your seat."); later ones say "Back in the seat."
 *   ready       the first question has arrived
 *   failed      something went wrong (connection, error): end straight away so the page can say so
 *   statusText  what VERA is doing, for the status line
 *
 * Skippable. The page doesn't show it under reduced motion, or when you rejoin an interview already running.
 */
export default function InterviewIntro({ full = false, ready, failed, statusText, onDone }) {
  const timing = full ? FULL : QUICK;
  const opacity = useMotionValue(1);
  const [pushing, setPushing] = useState(false);
  const done = useRef(onDone);

  useShot(pushing ? "interviewPush" : "interview", { opacity });

  useEffect(() => {
    done.current = onDone;
  });
  useEffect(() => {
    if (failed) {
      done.current();
      return undefined;
    }
    if (!ready) return undefined;
    setPushing(true); // eslint-disable-line react-hooks/set-state-in-effect -- reacting to the question's arrival
    const controls = animate(opacity, 0, { duration: timing.fade, ease: [0.55, 0, 0.75, 0.2] });
    const timer = setTimeout(() => done.current(), timing.hold);
    return () => {
      clearTimeout(timer);
      controls.stop();
    };
  }, [ready, failed, opacity, timing]);

  return (
    <section aria-labelledby="intro-title"
      className="relative -mx-4 -mt-8 flex h-[calc(100svh-7rem)] min-h-[26rem] flex-col items-center justify-end px-4 pb-10 text-center md:-mx-8 md:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-background via-background/50 to-transparent" />
      <motion.div className="relative flex flex-col items-center gap-4" initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: pushing ? 0 : 1, y: 0 }} transition={{ duration: 0.8, delay: pushing ? 0 : 0.6, ease: EASE }}>
        <p className="eyebrow">The interview room</p>
        <h1 id="intro-title" className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">
          {full ? "Take your" : "Back in the"} <span className="font-serif font-normal italic">seat.</span>
        </h1>
        <AgentStatus agent="interviewer" text={statusText} />
        <button type="button" onClick={() => done.current()}
          className="min-h-11 rounded-full px-4 text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          Skip intro
        </button>
      </motion.div>
    </section>
  );
}
