"use client";

import { useId, useRef, useState } from "react";

const LEVELS = [0, 1, 2, 3]; // 0 none · 1 one · 2 two · 3 three or more
// A single-hue ordinal ramp: the brand orange at rising strength over the dark surface (lighter = more).
// Contrast against the card surface: 2.2 / 4.1 / 7.2 : 1, so even the faintest step clears the 2:1 floor.
const FILL = ["var(--raised)", "rgb(255 122 46 / 0.42)", "rgb(255 122 46 / 0.7)", "var(--primary)"];
const level = (count) => Math.min(count, 3);
const fmt = (d) => d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const DAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

/**
 * Practice activity: the last 12 weeks, one square per day, brighter for more interviews started. Hover or
 * focus a day to read it; screen readers get a one-line summary and each day's label.
 * The calendar is one Tab stop (today); the arrow keys move a day (up/down) or a week (left/right).
 */
export default function ActivityHeatmap({ data }) {
  const hintId = useId();
  const box = useRef(null);
  const [focus, setFocus] = useState(null);
  const past = data.columns.flat().filter((d) => !d.future);
  const [cursor, setCursor] = useState(null); // the day that holds the Tab stop; today until you move
  const current = cursor ?? past.at(-1)?.key;
  const describe = (d) => `${fmt(d.date)}: ${d.count ? `${d.count} interview${d.count > 1 ? "s" : ""}` : "no interviews"}`;

  function onKeyDown(event) {
    const step = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7, Home: -Infinity, End: Infinity }[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const index = past.findIndex((d) => d.key === current);
    const next = past[Math.max(0, Math.min(past.length - 1, index + step))];
    setCursor(next.key);
    box.current?.querySelector(`[data-day="${next.key}"]`)?.focus();
  }

  return (
    <div>
      <p className="sr-only">{data.total} interviews on {data.activeDays} days in the last 12 weeks.</p>
      <div className="flex gap-3">
        <div aria-hidden="true" className="grid grid-rows-7 gap-[3px] pt-[1px] text-[10px] leading-[14px] text-subtle">
          {DAY_LABELS.map((l, i) => <span key={i} className="h-[14px]">{l}</span>)}
        </div>
        <p id={hintId} className="sr-only">Use the arrow keys to move between days.</p>
        <div ref={box} onKeyDown={onKeyDown} className="flex gap-[3px] overflow-x-auto" role="group"
          aria-label="Interviews per day, last 12 weeks" aria-describedby={hintId}>
          {data.columns.map((week) => (
            <div key={week[0].key} className="grid grid-rows-7 gap-[3px]">
              {week.map((d) => (
                <span key={d.key} data-day={d.key} role={d.future ? undefined : "img"} tabIndex={!d.future && d.key === current ? 0 : -1}
                  aria-label={d.future ? undefined : describe(d)}
                  onPointerEnter={() => !d.future && setFocus(d)} onPointerLeave={() => setFocus(null)}
                  onFocus={() => { setFocus(d); setCursor(d.key); }} onBlur={() => setFocus(null)}
                  className={`size-[14px] rounded-[3px] outline-offset-1 focus-visible:outline-2 focus-visible:outline-primary ${d.future ? "opacity-0" : ""}`}
                  style={{ background: FILL[level(d.count)] }} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted">
        <span aria-live="polite" className="min-h-4">{focus ? describe(focus) : `${data.total} interview${data.total === 1 ? "" : "s"} on ${data.activeDays} day${data.activeDays === 1 ? "" : "s"}`}</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          Less {LEVELS.map((l) => <span key={l} className="size-[10px] rounded-[2px]" style={{ background: FILL[l] }} />)} More
        </span>
      </div>
    </div>
  );
}
