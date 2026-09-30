"use client";

import { useScroll } from "motion/react";

/**
 * Scroll progress through a section as a motion value from 0 (its top reaches the viewport top) to 1 (its
 * bottom reaches the viewport bottom). Drives pinned scroll stories, such as the landing page's camera.
 */
export default function useSectionProgress(ref) {
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  return scrollYProgress;
}
