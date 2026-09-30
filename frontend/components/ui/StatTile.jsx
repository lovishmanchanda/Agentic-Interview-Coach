"use client";

import NumberTicker from "@/components/motion/NumberTicker";

/**
 * A headline number: label, value (counting up when numeric), an optional change since last time, and a note.
 * delta > 0 reads as better (success), < 0 as worse (warning); the arrow and sign carry it too, not colour alone.
 */
export default function StatTile({ label, value, decimals = 0, suffix, delta, deltaDecimals = 1, note, className = "" }) {
  const numeric = typeof value === "number";
  return (
    <div className={`elevated rounded-2xl p-4 sm:p-5 ${className}`}>
      <p className="text-xs text-muted">{label}</p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span className="text-3xl font-semibold tracking-tight">{numeric ? <NumberTicker value={value} decimals={decimals} /> : value}</span>
        {suffix && <span className="text-sm text-muted">{suffix}</span>}
      </p>
      {(note || (typeof delta === "number" && delta !== 0)) && (
        <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted">
          {typeof delta === "number" && delta !== 0 && (
            <span className={`font-medium ${delta > 0 ? "text-success" : "text-warning"}`}>
              {delta > 0 ? "▲ +" : "▼ "}{delta.toFixed(deltaDecimals)}
            </span>
          )}
          {note}
        </p>
      )}
    </div>
  );
}
