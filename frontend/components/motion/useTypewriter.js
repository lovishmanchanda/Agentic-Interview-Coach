"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";

/**
 * Reveals `text` a few words at a time, finishing in about `duration` ms however long it is: the look of a
 * reply being written. The server sends the whole reply at once; this is presentation only. Off (the full text
 * at once) when `enabled` is false or the viewer prefers reduced motion. `done` says when it's all shown.
 */
export default function useTypewriter(text, enabled, { duration = 1800, tick = 40 } = {}) {
  const reduce = useReducedMotion();
  const animate = enabled && !reduce;
  const tokens = useMemo(() => text.split(/(\s+)/), [text]);
  const [count, setCount] = useState(0);
  const done = !animate || count >= tokens.length;

  useEffect(() => {
    if (done) return undefined;
    const step = Math.max(1, Math.ceil(tokens.length / (duration / tick)));
    const id = setInterval(() => setCount((c) => c + step), tick);
    return () => clearInterval(id);
  }, [done, tokens.length, duration, tick]);

  return { text: done ? text : tokens.slice(0, count).join(""), done };
}
