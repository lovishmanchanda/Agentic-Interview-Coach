"use client";

import { motion, useScroll, useTransform } from "motion/react";
import { useRef, useState } from "react";

import Magnetic from "@/components/motion/Magnetic";
import SplitHeading from "@/components/motion/SplitHeading";
import Button from "@/components/ui/Button";
import useMediaQuery from "@/lib/useMediaQuery";
import { useAuthStore } from "@/store/authStore";
import { landingFraming } from "@/components/three/framings";
import { useScene, useSceneStore } from "@/store/sceneStore";

const EASE = [0.16, 1, 0.3, 1];
// The words arrive once the spotlight has flickered on; if the room is already lit (you came back here from
// signing in or out), almost at once.
const FIRST_VISIT_DELAY = 1.15;
const RETURN_DELAY = 0.15;

const fadeUp = (delay) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.9, delay, ease: EASE },
});

/** A film-credit line in a corner of the frame. */
function Credit({ delay, className, children }) {
  return (
    <motion.p {...fadeUp(delay + 0.9)}
      className={`absolute z-10 hidden font-mono text-[11px] uppercase tracking-[0.22em] text-muted lg:block ${className}`}>
      {children}
    </motion.p>
  );
}

/**
 * "Take the seat": the room starts dark, VERA's spotlight flickers on over the empty chair, then the words rise.
 * The hero is pinned while you scroll through it: the camera dollies toward the chair and the words fade.
 * Hovering the call to action switches on a warm light behind the chair.
 */
export default function Hero() {
  const section = useRef(null);
  const { scrollYProgress } = useScroll({ target: section, offset: ["start start", "end end"] }); // 1 exactly when the pin releases
  const textOpacity = useTransform(scrollYProgress, [0, 0.35], [1, 0]);
  const textY = useTransform(scrollYProgress, [0, 0.35], [0, -80]);
  const cueOpacity = useTransform(scrollYProgress, [0, 0.08], [1, 0]);
  // The room fades away as the pin releases, so the sections below sit on plain black.
  const sceneOpacity = useTransform(scrollYProgress, [0.78, 1], [1, 0]);
  const [warm, setWarm] = useState(false);
  const [afterLight] = useState(() => (useSceneStore.getState().everActive ? RETURN_DELAY : FIRST_VISIT_DELAY));
  const wide = useMediaQuery("(min-width: 768px)");
  const signedIn = useAuthStore((s) => s.hasHydrated && Boolean(s.accessToken));
  const warmOn = { onMouseEnter: () => setWarm(true), onMouseLeave: () => setWarm(false), onFocus: () => setWarm(true),
    onBlur: () => setWarm(false) };

  // The shared room (SceneHost) plays this shot; it stays alive when you go on to sign in, so the camera just
  // keeps moving into the auth shot.
  useScene({
    preset: "landing",
    progress: scrollYProgress,
    lightOn: warm,
    parallax: true,
    intro: true,
    framing: landingFraming(wide),
    opacity: sceneOpacity,
    label: "An empty chair under a spotlight in a dark room",
  });

  return (
    <section ref={section} className="relative h-[170svh] md:h-[190svh]" aria-labelledby="hero-title">
      <div className="sticky top-0 h-svh overflow-hidden">
        {/* Keep the words legible over the scene, and fade the room into the page below */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/90 via-background/20 to-transparent md:bg-gradient-to-r md:from-background/80 md:via-background/15 md:to-transparent" />
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-background to-transparent" />

        <Credit delay={afterLight} className="bottom-10 left-6 xl:left-10">Sc. 01 — The room</Credit>
        <Credit delay={afterLight} className="bottom-10 right-6 xl:right-10">
          <span className="mr-2 inline-block size-1.5 animate-blink rounded-full bg-steel align-middle" />VERA · standing by
        </Credit>

        <motion.div style={{ opacity: textOpacity, y: textY }}
          className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-end px-5 pb-24 sm:px-6 md:justify-center md:pb-0">
          <motion.p {...fadeUp(afterLight)}
            className="mb-6 inline-flex w-fit items-center gap-2 rounded-full border border-border-strong bg-background/60 px-3 py-1 font-mono text-[10px] uppercase tracking-[0.18em] text-muted backdrop-blur sm:text-xs">
            <span className="size-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
            Interview practice, taken seriously
          </motion.p>

          <SplitHeading as="h1" id="hero-title" text="Take the *seat.*" animateOnMount delay={afterLight + 0.1} stagger={0.1}
            className="max-w-3xl text-[clamp(3.4rem,13vw,9.5rem)] font-semibold leading-[0.88] tracking-[-0.055em]" />

          <motion.p {...fadeUp(afterLight + 0.5)} className="mt-6 max-w-md text-base leading-relaxed text-muted sm:text-lg md:text-xl">
            Practise real interviews with <span className="text-steel">VERA</span>. Improve with{" "}
            <span className="text-primary">ARIA</span>, a mentor that remembers every session you&apos;ve had.
          </motion.p>

          <motion.div {...fadeUp(afterLight + 0.7)} className="mt-9 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <Magnetic><Button href="/dashboard" size="lg" {...warmOn}>Back to your desk</Button></Magnetic>
            ) : (
              <>
                <Magnetic>
                  <Button href="/register" size="lg" className="shadow-[0_0_40px_-8px_var(--primary)]" {...warmOn}>
                    Take the seat <span aria-hidden="true">→</span>
                  </Button>
                </Magnetic>
                <Button href="#loop" size="lg" variant="secondary" className="bg-background/50 backdrop-blur">See how it works</Button>
              </>
            )}
          </motion.div>
        </motion.div>

        <motion.a href="#loop" style={{ opacity: cueOpacity }} aria-label="Scroll to how it works"
          className="absolute bottom-7 left-1/2 z-10 hidden -translate-x-1/2 flex-col sm:flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
          Scroll
          <span className="relative h-10 w-px overflow-hidden bg-border-strong">
            <motion.span className="absolute inset-x-0 top-0 h-4 bg-foreground"
              animate={{ y: [-16, 40] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} />
          </span>
        </motion.a>
      </div>
    </section>
  );
}
