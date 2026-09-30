"use client";

import { useId } from "react";

/**
 * A short label that appears above its trigger on hover and on keyboard focus (CSS only, no timers).
 * The trigger is described by it, so screen readers hear it too. Keep the text to a few words.
 */
export default function Tooltip({ content, children, side = "top" }) {
  const id = useId();
  const position = {
    top: "bottom-full left-1/2 mb-2 -translate-x-1/2",
    bottom: "top-full left-1/2 mt-2 -translate-x-1/2",
    right: "left-full top-1/2 ml-3 -translate-y-1/2",
  }[side];
  return (
    <span className="group/tip relative inline-flex" aria-describedby={id}>
      {children}
      <span id={id} role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-lg border border-border-strong bg-raised px-2.5 py-1 text-xs text-foreground opacity-0 shadow-lg transition-opacity duration-150 group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 ${position}`}>
        {content}
      </span>
    </span>
  );
}
