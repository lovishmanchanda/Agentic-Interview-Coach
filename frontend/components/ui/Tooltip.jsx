"use client";

import { useId } from "react";

/**
 * A short label that appears above its trigger on hover and on keyboard focus (CSS only, no timers).
 * The trigger is described by it, so screen readers hear it too. Keep the text to a few words.
 */
export default function Tooltip({ content, children, side = "top" }) {
  const id = useId();
  const position = side === "bottom" ? "top-full mt-2" : "bottom-full mb-2";
  return (
    <span className="group/tip relative inline-flex" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip"
        className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-lg border border-border-strong bg-raised px-2.5 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${position}`}>
        {content}
      </span>
    </span>
  );
}
