"use client";

import { motion, useScroll, useTransform } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { deskFraming } from "@/components/three/framings";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";
import { sheetsFromReports } from "@/lib/desk";
import { topicLabel } from "@/lib/interviewOptions";
import useMediaQuery from "@/lib/useMediaQuery";
import { useScene, useSceneStore } from "@/store/sceneStore";

const EASE = [0.16, 1, 0.3, 1];
const HIT_AREA = "[data-desk-hit]";

/** The one thing to do next, in order: finish what you started, drill your weakest topic, or begin. */
function nextStepFrom(sessions, welcome, reportCount) {
  const open = sessions.find((s) => !s.report_id && s.state !== "REPORT_READY");
  if (open) return { title: "Resume your interview", detail: `${open.config.interview_type} · in progress`, href: `/interview/session/${open.session_id}` };
  const weakest = welcome?.latest?.weakest_topic;
  if (weakest) return { title: `Drill ${topicLabel(weakest)}`, detail: "Your weakest topic last time", href: `/interview/configure?focus=${encodeURIComponent(weakest)}` };
  if (reportCount) return { title: "Take another interview", detail: "Keep the streak going", href: "/interview/configure" };
  return { title: "Take your first interview", detail: "About fifteen minutes with VERA", href: "/interview/configure" };
}

/**
 * The top of the dashboard is a window onto your desk: the same room the sign-in camera flew to (the shared
 * SceneHost), so arriving here continues that shot instead of starting a new one. Your report sheets lie on the
 * desk (click one to open it) and the lamp lights the next thing to do. Scrolling fades the room away.
 * Keyboard and screen-reader users get the same actions as plain links below the greeting.
 */
export default function DeskHero({ firstName, role, company }) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 768px)");
  // Start from whatever is already on the desk (the sign-in move put the sheets there), so nothing blinks.
  const [sheets, setSheets] = useState(() => useSceneStore.getState().props.desk?.reports ?? []);
  const [next, setNext] = useState(null);
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 520], [1, 0]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.reports.list().catch(() => []),
      api.interviews.list().catch(() => []),
      api.mentor.welcome().catch(() => null),
    ]).then(([reports, sessions, welcome]) => {
      if (cancelled) return;
      setSheets(sheetsFromReports(reports));
      setNext(nextStepFrom(sessions, welcome, reports.length));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useScene({
    preset: "desk",
    framing: deskFraming(wide),
    opacity,
    label: "Your desk: your interview reports, and a lamp over what to do next",
    desk: {
      reports: sheets,
      nextStep: next && { title: next.title, detail: next.detail },
      onOpenReport: (id) => router.push(`/interview/report/${id}`),
      onNextStep: () => next && router.push(next.href),
      hitArea: HIT_AREA,
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
        <div className="mt-6 flex flex-wrap items-center gap-3">
          {next ? (
            <Button href={next.href} className="shadow-[0_0_40px_-10px_var(--primary)]">{next.title} <span aria-hidden="true">→</span></Button>
          ) : (
            <span className="h-11" />
          )}
          {sheets[0] && <Button href={`/interview/report/${sheets[0].id}`} variant="secondary">Latest report</Button>}
        </div>
        {sheets.length > 0 && (
          <nav aria-label="Reports on your desk" className="sr-only">
            <ul>{sheets.map((s) => <li key={s.id}><Link href={`/interview/report/${s.id}`}>{s.label}, {s.date}: {s.score}/10</Link></li>)}</ul>
          </nav>
        )}
      </motion.div>
    </section>
  );
}
