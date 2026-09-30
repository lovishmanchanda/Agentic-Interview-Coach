"use client";

import { motion } from "motion/react";
import { useId, useRef } from "react";

/**
 * A tab row with a sliding highlight. Keyboard: arrow keys move between tabs, Home/End jump (WAI-ARIA tabs).
 * tabs: [{ value, label }]. Render the panel yourself with id={`${idBase}-panel-${value}`} if you need the link.
 */
export default function Tabs({ tabs, value, onChange, label, className = "" }) {
  const id = useId();
  const refs = useRef({});

  function onKeyDown(event) {
    const index = tabs.findIndex((t) => t.value === value);
    const moves = { ArrowRight: index + 1, ArrowLeft: index - 1, Home: 0, End: tabs.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length];
    onChange(next.value);
    refs.current[next.value]?.focus();
  }

  return (
    <div role="tablist" aria-label={label} onKeyDown={onKeyDown}
      className={`inline-flex rounded-xl border border-border bg-surface p-1 ${className}`}>
      {tabs.map((tab) => {
        const selected = tab.value === value;
        return (
          <button key={tab.value} ref={(node) => { refs.current[tab.value] = node; }} type="button" role="tab"
            aria-selected={selected} tabIndex={selected ? 0 : -1} onClick={() => onChange(tab.value)}
            className={`relative h-9 rounded-lg px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selected ? "text-foreground" : "text-muted hover:text-foreground"}`}>
            {selected && <motion.span layoutId={`tab-${id}`} className="absolute inset-0 rounded-lg bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.05)]" transition={{ type: "spring", duration: 0.4, bounce: 0.15 }} />}
            <span className="relative">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
