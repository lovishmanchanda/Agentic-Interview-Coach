"use client";

import Lenis from "lenis";
import { useReducedMotion } from "motion/react";
import { useEffect } from "react";

/**
 * Smooth, eased page scrolling for the landing page's scroll story. Used there only: in the app, scrolling
 * must stay native (chat lists, the code editor, long reports). Off under reduced motion.
 */
export default function SmoothScroll({ children }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (reduce) return undefined;
    // anchors: in-page links (#loop, #faq) glide instead of jumping
    const lenis = new Lenis({ duration: 1.1, easing: (t) => 1 - Math.pow(1 - t, 4), anchors: { offset: -64 } });
    let frame = requestAnimationFrame(function raf(time) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    });
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, [reduce]);

  return children;
}
