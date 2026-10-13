"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

/**
 * Frame pacing for the room (the canvas runs frameloop="demand"; <FramePacer /> decides when to draw).
 *
 * Most of the time the room is only breathing: dust drifting, a figure breathing, an interviewer writing. That
 * reads just as well at 30 fps, so that's all we draw, half the GPU work of a free-running 60 fps loop. While
 * something actually moves (the camera, the chair, a walk-in, a sheet dropping, the pointer or the page
 * scrolling) components call busy() and every display frame is drawn.
 *
 * It also keeps the resolution honest: if the display itself can't keep up (frames under ~45 fps while busy),
 * the pixel ratio steps down a notch; after a few smooth seconds it steps back up.
 */
const AMBIENT_FPS = 30;
const MAX_DPR = 1.5;
const MIN_DPR = 0.75;

let ceiling = MAX_DPR;
/** The highest pixel ratio this device's quality tier allows (quality.js). */
export function setDprCeiling(value) {
  ceiling = value;
}

let busyUntil = 0;
/** Something is moving: draw every frame for the next `seconds`. Cheap; call it from useFrame freely. */
export function busy(seconds = 0.25) {
  busyUntil = Math.max(busyUntil, performance.now() + seconds * 1000);
}
export const isBusy = () => performance.now() < busyUntil;

/**
 * Should shadow maps be re-rendered this frame? Always while something moves; otherwise every third frame
 * (~10 fps at the ambient rate): breathing and drifting don't need fresher shadows, and shadow passes are the
 * most expensive part of the room. Each caller keeps its own counter object.
 */
export function shadowFrame(counter) {
  counter.n = (counter.n + 1) % 3;
  return reduced || isBusy() || counter.n === 0; // reduced motion draws rarely: every frame it does draw counts
}

// "Reduce motion", read once and kept current (it used to be a matchMedia() call in every frame of every part).
let reduced = false;
if (typeof window !== "undefined") {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  reduced = query.matches;
  query.addEventListener("change", (e) => {
    reduced = e.matches;
  });
}
export const prefersReducedMotion = () => reduced;

// A touch screen (no hover): hover-only touches in the room need an equivalent that plays by itself.
let touchOnly = false;
if (typeof window !== "undefined") {
  const query = window.matchMedia("(hover: none)");
  touchOnly = query.matches;
  query.addEventListener("change", (e) => {
    touchOnly = e.matches;
  });
}
export const isTouchOnly = () => touchOnly;

/** Draws the room at full rate while busy, at AMBIENT_FPS otherwise, and adapts the resolution. */
export function FramePacer() {
  const invalidate = useThree((s) => s.invalidate);
  const setDpr = useThree((s) => s.setDpr);
  const drawn = useRef(0);

  // The pointer (parallax) and scrolling (scroll-driven camera) move the shot: full rate while they happen.
  useEffect(() => {
    const wake = () => busy(0.6);
    const options = { passive: true };
    window.addEventListener("pointermove", wake, options);
    window.addEventListener("scroll", wake, options);
    window.addEventListener("wheel", wake, options);
    window.addEventListener("resize", wake, options);
    busy(1);
    return () => {
      window.removeEventListener("pointermove", wake, options);
      window.removeEventListener("scroll", wake, options);
      window.removeEventListener("wheel", wake, options);
      window.removeEventListener("resize", wake, options);
    };
  }, []);

  useEffect(() => {
    let id = 0;
    let last = 0;
    const stats = { frames: 0, since: performance.now(), dpr: Math.min(ceiling, window.devicePixelRatio || 1), calm: 0 };
    const tick = (now) => {
      id = requestAnimationFrame(tick);
      const max = Math.min(ceiling, window.devicePixelRatio || 1);
      if (stats.dpr > max) {
        stats.dpr = max; // the quality tier was just decided: start there
        setDpr(max);
      }
      const isBusy = now < busyUntil;
      if (isBusy || now - drawn.current >= 1000 / AMBIENT_FPS - 2) invalidate();

      // Display frame rate, measured only while we're drawing every frame (otherwise it says nothing).
      if (isBusy && last && now - last < 250) stats.frames += 1;
      else if (!isBusy) {
        stats.frames = 0;
        stats.since = now;
      }
      last = now;
      if (now - stats.since >= 1000) {
        const fps = (stats.frames * 1000) / (now - stats.since);
        if (fps < 45 && stats.dpr > MIN_DPR) {
          stats.dpr = Math.max(MIN_DPR, stats.dpr - 0.25);
          stats.calm = 0;
          setDpr(stats.dpr);
        } else if (fps > 57 && stats.dpr < max && (stats.calm += 1) >= 4) {
          stats.dpr = Math.min(max, stats.dpr + 0.25);
          stats.calm = 0;
          setDpr(stats.dpr);
        }
        stats.frames = 0;
        stats.since = now;
      }
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [invalidate, setDpr]);

  // Remember when a frame was actually drawn (any source: our ticks, prop changes, R3F events).
  useFrame(() => {
    drawn.current = performance.now();
  });
  return null;
}

