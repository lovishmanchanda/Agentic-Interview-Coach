"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Suspense, useState } from "react";

import Logo from "@/components/brand/Logo";
import RedirectIfSignedIn from "@/components/layout/RedirectIfSignedIn";
import { deskFraming, landingFraming } from "@/components/three/framings";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { sheetsFromReports } from "@/lib/desk";
import useMediaQuery from "@/lib/useMediaQuery";
import { useProfileStore } from "@/store/profileStore";
import { useScene } from "@/store/sceneStore";

import AuthForm from "./AuthForm";

const EASE = [0.16, 1, 0.3, 1];
// The chair sits left of the card on wide screens; on phones the room is a dim backdrop above it.
const WIDE_FRAMING = { x: 0.75, y: 0, distance: 1 };
const PHONE_FRAMING = { x: 0, y: -1.05, distance: 1.6 };
const TO_DESK_MS = 1300;
const TO_LANDING_MS = 1100;
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

/**
 * The auth screen: the interview room (the site-wide SceneHost), dimmed, behind one glass card that is both
 * "sign in" and "create account". When you get in, the card steps aside and the camera glides on to where
 * you're going, and the next page picks up the same shot (the room is never torn down):
 *   signing in           → back to the chair under the spotlight: the landing page ("Back to your desk")
 *   sent here from a page → that page (its ?next=), via the desk
 *   creating an account  → the desk, then onboarding; profile and reports load during the move
 * (Under reduced motion it goes straight through.)
 */
export default function AuthShell({ children }) {
  const router = useRouter();
  const wide = useMediaQuery("(min-width: 1024px)");
  const deskWide = useMediaQuery("(min-width: 768px)"); // the same breakpoint as the dashboard's desk shot
  const [leavingTo, setLeavingTo] = useState(null); // null | "landing" | "desk"
  const [sheets, setSheets] = useState([]);
  const leaving = leavingTo !== null;

  const shot = {
    landing: { preset: "landing", framing: landingFraming(deskWide) }, // the same numbers the landing hero uses
    desk: { preset: "desk", framing: deskFraming(deskWide) },
  }[leavingTo] ?? { preset: "auth", framing: wide ? WIDE_FRAMING : PHONE_FRAMING };
  useScene({
    ...shot,
    parallax: leavingTo !== "desk",
    desk: leavingTo === "desk" ? { reports: sheets } : undefined,
    label: "The interview room, dimly lit",
  });

  async function onSuccess(destination) {
    const toLanding = destination === "/";
    // Start what the next page needs now, in parallel with the camera move (the landing page needs nothing).
    const loads = toLanding ? [] : [
      useProfileStore.getState().load({ force: true }).catch(() => null),
      api.reports.list().then((list) => setSheets(sheetsFromReports(list))).catch(() => null),
    ];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      await Promise.all(loads);
      router.replace(destination);
      return;
    }
    setLeavingTo(toLanding ? "landing" : "desk");
    await Promise.all([...loads, wait(toLanding ? TO_LANDING_MS : TO_DESK_MS)]);
    router.replace(destination);
  }

  return (
    <div className="relative min-h-svh overflow-hidden">
      <RedirectIfSignedIn />
      <motion.div aria-hidden="true" animate={{ opacity: leaving ? 0 : 1 }} transition={{ duration: 0.8 }}
        className="pointer-events-none fixed inset-0 bg-gradient-to-t from-background via-background/40 to-background/10 lg:bg-gradient-to-l lg:from-background/85 lg:via-background/30 lg:to-transparent" />

      <header className="relative z-10 mx-auto flex h-16 max-w-7xl items-center px-5 sm:px-8">
        <Link href="/" aria-label="InterviewOS home"><Logo /></Link>
      </header>

      <main className="relative z-10 mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl items-end justify-center px-4 pb-6 sm:px-8 sm:pb-12 lg:items-center lg:justify-end lg:pb-16">
        <AnimatePresence>
          {!leaving && (
            <motion.div key="card" initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -16, scale: 0.98, filter: "blur(6px)" }} transition={{ duration: 0.6, ease: EASE }}
              className="w-full max-w-md rounded-[1.75rem] border border-border-strong bg-surface/70 p-6 shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)] backdrop-blur-2xl sm:p-8">
              <Suspense fallback={<div className="flex h-80 items-center justify-center"><Spinner label="Loading…" /></div>}>
                <AuthForm onSuccess={onSuccess} />
              </Suspense>
            </motion.div>
          )}
        </AnimatePresence>
        {leaving && (
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4, duration: 0.6 }}
            className="absolute bottom-12 left-1/2 -translate-x-1/2 font-mono text-xs uppercase tracking-[0.22em] text-muted">
            {leavingTo === "landing" ? "Welcome back…" : "To your desk…"}
          </motion.p>
        )}
      </main>

      <motion.p animate={{ opacity: leaving ? 0 : 1 }}
        className="pointer-events-none fixed bottom-8 left-8 z-10 hidden font-mono text-[11px] uppercase tracking-[0.22em] text-muted lg:block">
        Sc. 02 — Before the interview
      </motion.p>
      {children}
    </div>
  );
}
