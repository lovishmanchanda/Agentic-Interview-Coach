"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * Text that arrives word by word, each word sharpening out of a soft blur, like someone reading it out.
 * Whitespace and line breaks are kept (render inside a whitespace-pre-wrap block). Long text is capped so the
 * whole reveal never takes more than ~1.2 s. Reduced motion, or `animate={false}`, shows it at once.
 */
export default function RevealText({ text, animate = true, stagger = 0.022, maxDelay = 1.2 }) {
  const reduce = useReducedMotion();
  if (!animate || reduce) return text;
  // Tokens alternate word / whitespace; number the words up front so each knows its place in the wave.
  const tokens = text.split(/(\s+)/).filter(Boolean);
  const isSpace = (t) => /^\s+$/.test(t);
  const order = tokens.map((t, i) => (isSpace(t) ? -1 : tokens.slice(0, i).filter((x) => !isSpace(x)).length));
  const words = order.filter((n) => n >= 0).length;
  const step = Math.min(stagger, maxDelay / Math.max(words, 1));
  return tokens.map((token, i) => (isSpace(token) ? token : (
    <motion.span key={i} className="inline-block" initial={{ opacity: 0, filter: "blur(6px)", y: 3 }}
      animate={{ opacity: 1, filter: "blur(0px)", y: 0 }} transition={{ duration: 0.45, delay: order[i] * step, ease: [0.16, 1, 0.3, 1] }}>
      {token}
    </motion.span>
  )));
}
