"use client";

import { animate, useInView, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";

/**
 * A number that counts up from 0 when it scrolls into view (KPI tiles, scores). Screen readers and
 * reduced motion get the final value straight away; the counting is visual only.
 * The visible digits are written by the animation alone (React renders no children there), so React and
 * the animation never fight over the same text node.
 */
export default function NumberTicker({ value, decimals = 0, duration = 1.2, className = "" }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true });
  const reduce = useReducedMotion();
  const target = Number(value || 0);
  const final = target.toFixed(decimals);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;
    if (reduce) {
      node.textContent = final;
      return undefined;
    }
    if (!inView) {
      node.textContent = (0).toFixed(decimals);
      return undefined;
    }
    const controls = animate(0, target, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        node.textContent = v.toFixed(decimals);
      },
    });
    return () => controls.stop();
  }, [inView, reduce, target, final, decimals, duration]);

  return (
    <span className={`tabular-nums ${className}`}>
      <span ref={ref} aria-hidden="true" />
      <span className="sr-only">{final}</span>
    </span>
  );
}
