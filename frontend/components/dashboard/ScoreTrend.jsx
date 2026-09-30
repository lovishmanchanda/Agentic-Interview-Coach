"use client";

import { motion } from "motion/react";
import { useId, useRef, useState } from "react";

import { ADEQUATE, STRONG } from "@/lib/dashboard";
import { labelFor } from "@/lib/profileOptions";
import { INTERVIEW_TYPES } from "@/lib/interviewOptions";
import useElementWidth from "@/lib/useElementWidth";

const H = 220;
const PAD = { left: 30, right: 14, top: 14, bottom: 28 };
const TICKS = [0, 2.5, 5, 7.5, 10];
const fmtDate = (d) => d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
const fmtTime = (d) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

/**
 * Overall score across your interviews, oldest → newest. One series, so one hue (the brand orange) and no legend;
 * the card names it. Built to the dataviz specs: 2 px line, ≥ 8 px markers with a surface ring, recessive
 * gridlines with the tier boundaries (5 adequate, 7.5 strong) a step stronger and named in the caption, a
 * crosshair + tooltip on hover and keyboard, direct labels only on the first and last point, and a table view.
 * The line draws itself when it scrolls into view.
 */
export default function ScoreTrend({ points }) {
  const id = useId();
  const box = useRef(null);
  const width = useElementWidth(box);
  const [active, setActive] = useState(null);
  const [showTable, setShowTable] = useState(false);

  const n = points.length;
  const innerW = Math.max(width - PAD.left - PAD.right, 10);
  const innerH = H - PAD.top - PAD.bottom;
  const x = (i) => PAD.left + (n === 1 ? innerW / 2 : (i * innerW) / (n - 1));
  const y = (v) => PAD.top + (1 - v / 10) * innerH;
  const line = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score).toFixed(1)}`).join(" ");
  const area = n > 1 ? `${line} L${x(n - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const first = points[0];
  const last = points[n - 1];
  // Axis labels: dates, or times when every interview was on the same day.
  const sameDay = n > 1 && first.date.toDateString() === last.date.toDateString();
  const axisLabel = sameDay ? fmtTime : fmtDate;
  const summary = n === 1
    ? `One interview so far, scored ${last.score} out of 10.`
    : `Overall score across ${n} interviews, from ${first.score} on ${fmtDate(first.date)} to ${last.score} on ${fmtDate(last.date)}.`;

  function onPointerMove(event) {
    const rect = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - rect.left;
    let nearest = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(nearest) - px)) nearest = i;
    });
    setActive(nearest);
  }
  function onKeyDown(event) {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    setActive((a) => Math.max(0, Math.min(n - 1, (a ?? n - 1) + (event.key === "ArrowRight" ? 1 : -1))));
  }

  const tip = active !== null ? points[active] : null;
  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">Guide lines: {ADEQUATE} = adequate · {STRONG} = strong</p>
        <button type="button" onClick={() => setShowTable((s) => !s)} aria-controls={`${id}-table`} aria-expanded={showTable}
          className="text-xs text-muted underline-offset-4 hover:text-foreground hover:underline">
          {showTable ? "Show chart" : "Show table"}
        </button>
      </div>

      {showTable ? (
        <table id={`${id}-table`} className="w-full text-sm">
          <caption className="sr-only">{summary}</caption>
          <thead><tr className="text-left text-xs text-muted"><th className="py-1.5 font-medium">Date</th><th className="font-medium">Type</th><th className="text-right font-medium">Score</th></tr></thead>
          <tbody>
            {[...points].reverse().map((p) => (
              <tr key={p.id} className="border-t border-border"><td className="py-1.5">{fmtDate(p.date)}</td><td className="text-muted">{labelFor(INTERVIEW_TYPES, p.type)}</td><td className="text-right font-mono">{p.score.toFixed(1)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={box} className="relative">
          {width > 0 && (
            <svg width={width} height={H} role="img" aria-label={summary} tabIndex={0} onKeyDown={onKeyDown}
              onPointerMove={onPointerMove} onPointerLeave={() => setActive(null)} onBlur={() => setActive(null)}
              className="block overflow-visible rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <defs>
                <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--chart-mark)" stopOpacity="0.22" />
                  <stop offset="1" stopColor="var(--chart-mark)" stopOpacity="0" />
                </linearGradient>
              </defs>
              {TICKS.map((t) => (
                <g key={t}>
                  <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)}
                    stroke={t === ADEQUATE || t === STRONG ? "var(--border-strong)" : "var(--border)"}
                    strokeDasharray={t === ADEQUATE || t === STRONG ? "4 4" : undefined} />
                  <text x={PAD.left - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-subtle font-mono text-[10px]">{t}</text>
                </g>
              ))}
              {area && (
                <motion.path d={area} fill={`url(#${id}-fill)`} initial={{ opacity: 0 }} whileInView={{ opacity: 1 }}
                  viewport={{ once: true }} transition={{ duration: 1, delay: 0.6 }} />
              )}
              {n > 1 && (
                <motion.path d={line} fill="none" stroke="var(--chart-mark)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"
                  initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }}
                  transition={{ duration: 1.3, ease: [0.16, 1, 0.3, 1] }} />
              )}
              {tip && <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={y(0)} stroke="var(--muted)" strokeWidth="1" strokeDasharray="2 3" />}
              {points.map((p, i) => (
                <circle key={p.id} cx={x(i)} cy={y(p.score)} r={i === active ? 6 : 4.5} fill="var(--chart-mark)"
                  stroke="var(--surface)" strokeWidth="2" className="transition-[r] duration-150" />
              ))}
              {/* Direct labels on the ends only; everything else is in the tooltip */}
              <text x={x(n - 1)} y={y(last.score) - 12} textAnchor={n === 1 ? "middle" : "end"} className="fill-foreground font-mono text-[11px]">{last.score.toFixed(1)}</text>
              {n > 1 && <text x={x(0)} y={y(first.score) - 12} textAnchor="start" className="fill-muted font-mono text-[11px]">{first.score.toFixed(1)}</text>}
              <text x={x(0)} y={H - 8} textAnchor={n === 1 ? "middle" : "start"} className="fill-subtle text-[10px]">{axisLabel(first.date)}</text>
              {n > 1 && <text x={x(n - 1)} y={H - 8} textAnchor="end" className="fill-subtle text-[10px]">{axisLabel(last.date)}</text>}
            </svg>
          )}
          {tip && (
            <div role="status" className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 -translate-y-2 rounded-lg border border-border-strong bg-raised px-3 py-2 text-xs shadow-xl"
              style={{ left: Math.min(Math.max(x(active), 70), width - 70) }}>
              <p className="font-mono text-sm text-foreground">{tip.score.toFixed(1)} <span className="text-muted">/ 10</span></p>
              <p className="text-muted">{labelFor(INTERVIEW_TYPES, tip.type)} · {fmtDate(tip.date)}, {fmtTime(tip.date)}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
