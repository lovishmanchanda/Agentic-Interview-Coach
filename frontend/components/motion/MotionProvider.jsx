"use client";

import { MotionConfig } from "motion/react";

/**
 * App-wide motion settings. reducedMotion="user": when the OS asks for reduced motion, every `motion`
 * animation drops its movement (transforms, layout) and keeps only opacity, with no per-component checks.
 */
export default function MotionProvider({ children }) {
  return (
    <MotionConfig reducedMotion="user" transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}>
      {children}
    </MotionConfig>
  );
}
