"use client";

import { motion, useMotionValue, useReducedMotion, useSpring } from "motion/react";
import { useRef } from "react";

/**
 * Pulls its child a few pixels toward the cursor, then springs back: for the one or two hero actions per page.
 * Mouse only (touch and reduced motion get a still button).
 */
export default function Magnetic({ strength = 0.28, className = "", children }) {
  const ref = useRef(null);
  const reduce = useReducedMotion();
  const x = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });
  const y = useSpring(useMotionValue(0), { stiffness: 220, damping: 18, mass: 0.4 });

  function onPointerMove(event) {
    if (reduce || event.pointerType !== "mouse" || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    x.set((event.clientX - (rect.left + rect.width / 2)) * strength);
    y.set((event.clientY - (rect.top + rect.height / 2)) * strength);
  }
  function reset() {
    x.set(0);
    y.set(0);
  }

  return (
    <motion.div ref={ref} style={{ x, y }} onPointerMove={onPointerMove} onPointerLeave={reset} className={`inline-block ${className}`}>
      {children}
    </motion.div>
  );
}
