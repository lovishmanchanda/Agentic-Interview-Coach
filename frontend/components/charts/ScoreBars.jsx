"use client";

import { useId, useState } from "react";

/**
 * Horizontal bars on the 0-10 score scale. One series, so one hue (--chart-mark, validated for both
 * themes) and no legend: the card title names it. Built to the dataviz specs: bars ≤ 16px with a 4px
 * rounded end and a square baseline, hairline gridlines, the two tier thresholds (5 adequate, 7.5 strong)
 * as slightly stronger reference lines named in a caption, the value at each bar's tip in text colour, a tooltip on hover and keyboard
 * focus, and a table view so nothing depends on seeing the bars.
 *
 * rows: [{ key, label, value, detail? }]  (detail: extra tooltip/table text, e.g. "follow-up · 2:30")
 */
const TICKS = [0, 2.5, 5, 7.5, 10];
const THRESHOLDS = new Set([5, 7.5]); // the tier boundaries: drawn a step stronger and named in the caption

export function tierFor(score) {
  if (score >= 7.5) return "strong";
  return score >= 5 ? "adequate" : "weak";
}

const pct = (v) => `${Math.max(0, Math.min(10, v)) * 10}%`;

export default function ScoreBars({ title, description, rows, labelWidth = "7.5rem" }) {
  const id = useId();
  const [showTable, setShowTable] = useState(false);
  const [active, setActive] = useState(null);

  if (!rows?.length) return null;
  return (
    <section className="rounded-xl border border-border bg-surface p-5" aria-labelledby={`${id}-title`}>
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold">{title}</h2>
          {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
        </div>
        <button type="button" onClick={() => setShowTable((v) => !v)} aria-expanded={showTable}
          className="shrink-0 rounded-md px-2 py-1 text-xs text-muted hover:bg-surface-muted hover:text-foreground">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </header>

      {showTable ? (
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted">
              <th className="py-1.5 font-medium">Item</th>
              <th className="py-1.5 text-right font-medium">Score</th>
              <th className="py-1.5 pl-3 font-medium">Tier</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/60 last:border-0">
                <td className="py-1.5">{r.label}{r.detail ? <span className="text-muted"> · {r.detail}</span> : null}</td>
                <td className="py-1.5 text-right">{r.value}</td>
                <td className="py-1.5 pl-3 text-muted">{tierFor(r.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="list" className="space-y-2.5">
          {rows.map((r) => (
            <div key={r.key} role="listitem" className="grid items-center gap-3"
              style={{ gridTemplateColumns: `${labelWidth} 1fr` }}>
              <span className="truncate text-xs text-muted" title={r.label}>{r.label}</span>
              {/* Right padding keeps room for the value label past a 10/10 bar. */}
              <div className="relative h-5 pr-9">
                <div className="relative h-full">
                  {TICKS.map((t) => (
                    <span key={t} aria-hidden className={`absolute inset-y-0 w-px ${THRESHOLDS.has(t) ? "bg-muted/40" : "bg-border"}`}
                      style={{ left: pct(t) }} />
                  ))}
                  <div
                    tabIndex={0}
                    aria-label={`${r.label}: ${r.value} out of 10, ${tierFor(r.value)}${r.detail ? `, ${r.detail}` : ""}`}
                    onPointerEnter={() => setActive(r.key)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(r.key)}
                    onBlur={() => setActive(null)}
                    className="group absolute inset-y-0 left-0 flex items-center outline-none"
                    style={{ width: pct(r.value), minWidth: "4px" }}
                  >
                    {/* Hit target: the full row height, bigger than the 14px mark. */}
                    <span className="h-3.5 w-full rounded-r-[4px] bg-chart-mark transition-colors group-hover:bg-chart-mark-hover group-focus-visible:bg-chart-mark-hover group-focus-visible:outline group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary" />
                    <span className="absolute left-full pl-1.5 text-xs font-medium tabular-nums text-foreground">{r.value}</span>
                    {active === r.key && (
                      <span role="tooltip"
                        className="pointer-events-none absolute bottom-full left-full z-10 mb-1 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs shadow-md">
                        <strong className="font-semibold">{r.value}/10</strong>
                        <span className="text-muted"> · {r.label} · {tierFor(r.value)}{r.detail ? ` · ${r.detail}` : ""}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
          {/* Axis: ticks, plus the two tier thresholds as named reference points. */}
          <div aria-hidden className="grid gap-3" style={{ gridTemplateColumns: `${labelWidth} 1fr` }}>
            <span />
            <div className="relative h-4 pr-9 text-[10px] text-muted">
              <div className="relative h-full">
                {TICKS.map((t) => (
                  <span key={t} className="absolute top-0 -translate-x-1/2 tabular-nums" style={{ left: pct(t) }}>{t}</span>
                ))}
              </div>
            </div>
          </div>
          {/* Named here rather than under the axis, where the two labels collide at phone width. */}
          <p className="pt-1 text-[11px] text-muted">Guide lines: 5 = adequate · 7.5 = strong</p>
        </div>
      )}
    </section>
  );
}
