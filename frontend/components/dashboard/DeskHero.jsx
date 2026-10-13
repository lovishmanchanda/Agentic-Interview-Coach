"use client";

import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { useShot } from "@/components/three/shots";
import Button from "@/components/ui/Button";
import { nextStep } from "@/lib/dashboard";
import { sheetsFromReports } from "@/lib/desk";
import { useSceneStore } from "@/store/sceneStore";

const EASE = [0.16, 1, 0.3, 1];
const HIT_AREA = "[data-desk-hit]";
const SEEN_KEY = "aic-desk-seen"; // the newest report this browser has already seen land on the desk

function readSeen() {
  try {
    return window.localStorage.getItem(SEEN_KEY);
  } catch {
    return null;
  }
}
function writeSeen(id) {
  try {
    window.localStorage.setItem(SEEN_KEY, id);
  } catch {
    // storage blocked: no drop next time, that's all
  }
}

/**
 * The top of the dashboard is a window onto your desk: the same room the sign-in camera flew to (the shared
 * SceneHost), so arriving here continues that shot instead of starting a new one. Your report sheets lie on the
 * desk (click one to open it) and the lamp lights the next thing to do. Scrolling fades the room away.
 * Keyboard and screen-reader users get the same actions as plain links below the greeting.
 * `data` comes from useDashboardData (fetched once for the whole page).
 */
export default function DeskHero({ firstName, role, company, data }) {
  const router = useRouter();
  // Until the page's data arrives, keep whatever is already on the desk (the sign-in move put the sheets
  // there), so nothing blinks.
  const [initialSheets] = useState(() => useSceneStore.getState().props.desk?.reports ?? []);
  const ready = data.status === "ready";
  const sheets = ready ? sheetsFromReports(data.reports) : initialSheets;
  const next = ready ? nextStep(data.sessions, data.welcome, data.reports.length) : null;
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 520], [1, 0]);

  // A report you haven't seen on the desk yet (you've just finished an interview) drops onto the stack.
  const latest = ready ? sheets[0]?.id ?? "none" : null;
  const [drop, setDrop] = useState(null);
  useEffect(() => {
    if (!latest) return;
    const seen = readSeen();
    writeSeen(latest);
    if (seen !== null && seen !== latest && latest !== "none") queueMicrotask(() => setDrop(latest));
  }, [latest]);

  useShot("desk", {
    opacity,
    desk: {
      reports: sheets,
      nextStep: next && { title: next.title, detail: next.detail },
      onOpenReport: (id) => router.push(`/interview/report/${id}`),
      onNextStep: () => next && router.push(next.href),
      hitArea: HIT_AREA,
      drop,
    },
  });

  return (
    <section data-desk-hit aria-labelledby="desk-title"
      className="relative -mx-4 -mt-8 flex h-[62svh] min-h-[24rem] flex-col justify-end px-4 pb-8 md:-mx-8 md:px-8 md:pb-10">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-background via-background/60 to-transparent" />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.25, ease: EASE }}
        className="relative max-w-xl">
        <p className="eyebrow">Your desk</p>
        <h1 id="desk-title" className="mt-3 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
          Hi <span className="font-serif font-normal italic tracking-[-0.02em]">{firstName}.</span>
        </h1>
        <p className="mt-2 text-muted">
          Preparing for <span className="text-foreground">{role}</span>{company ? ` at ${company}` : ""}.
          {sheets.length > 0 ? ` ${sheets.length} report${sheets.length > 1 ? "s" : ""} on your desk.` : ""}
        </p>
        <div className="mt-6 flex min-h-11 flex-wrap items-center gap-3">
          {next && <Button href={next.href} className="shadow-[0_0_40px_-10px_var(--primary)]">{next.title} <span aria-hidden="true">→</span></Button>}
          {sheets[0] && <Button href={`/interview/report/${sheets[0].id}`} variant="secondary">Latest report</Button>}
        </div>
        {sheets.length > 0 && (
          // Hidden until a keyboard user tabs into it: then it shows, so focus is never invisible.
          <nav aria-label="Reports on your desk" className="sr-only focus-within:not-sr-only focus-within:mt-4 focus-within:rounded-2xl focus-within:border focus-within:border-border focus-within:bg-surface focus-within:p-3">
            <ul className="space-y-1">{sheets.map((s) => (
              <li key={s.id}><Link href={`/interview/report/${s.id}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-raised">{s.label}, {s.date}: {s.score}/10</Link></li>
            ))}</ul>
          </nav>
        )}
      </motion.div>
    </section>
  );
}
