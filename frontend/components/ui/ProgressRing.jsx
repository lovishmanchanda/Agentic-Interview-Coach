"use client";

import { motion } from "motion/react";

import NumberTicker from "@/components/motion/NumberTicker";

/**
 * A score ring (0..max) that draws itself when it comes into view, with the number counting up inside.
 * `tone` colours the arc; the number stays in text colour. `label` names it for screen readers.
 */
const TONES = { primary: "var(--primary)", success: "var(--success)", warning: "var(--warning)", steel: "var(--steel)", neutral: "var(--muted)" };

export default function ProgressRing({ value, max = 10, size = "size-28", tone = "primary", decimals = 1, label, caption, stroke = 6 }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  const fraction = Math.max(0, Math.min(1, value / max));
  return (
    <div className={`relative shrink-0 ${size}`} role="img" aria-label={label || `${value} out of ${max}`}>
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="var(--border)" strokeWidth={stroke} />
        <motion.circle cx="60" cy="60" r={r} fill="none" stroke={TONES[tone]} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} initial={{ strokeDashoffset: c }} whileInView={{ strokeDashoffset: c * (1 - fraction) }}
          viewport={{ once: true }} transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }} />
      </svg>
      <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[1.6em] font-semibold tracking-tight"><NumberTicker value={value} decimals={decimals} /></span>
        {caption && <span className="text-[0.6em] text-muted">{caption}</span>}
      </div>
    </div>
  );
}
