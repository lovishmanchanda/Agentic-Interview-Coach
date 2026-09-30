"use client";

import { motion } from "motion/react";

import { CheckIcon } from "@/components/ui/icons";
import { presetMeta } from "@/lib/interviewPresets";

/**
 * The starting points as big radio cards. The orange outline glides from card to card (one shared layoutId),
 * so choosing reads as moving a light, not repainting a grid. Real radio inputs underneath: arrow keys and
 * screen readers work as with any radio group. A recommended preset (the drill) spans the full row.
 */
export default function PresetPicker({ presets, value, onChange, reasonFor }) {
  return (
    <fieldset>
      <legend className="sr-only">Choose a starting point</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {presets.map((p) => {
          const selected = value === p.id;
          const reason = reasonFor(p);
          const { Icon } = p;
          return (
            <label key={p.id} title={reason || undefined}
              className={`group relative flex flex-col rounded-2xl border p-4 sm:min-h-36 transition-[border-color,background-color] duration-300 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2 has-[:focus-visible]:ring-offset-background sm:p-5 ${
                p.recommended ? "sm:col-span-2 sm:min-h-0" : ""} ${
                reason ? "cursor-not-allowed border-border bg-surface/50 opacity-50"
                  : selected ? "cursor-pointer border-transparent bg-primary-soft/50"
                    : "cursor-pointer border-border bg-surface hover:border-border-strong hover:bg-raised"}`}>
              <input type="radio" name="preset" value={p.id} checked={selected} disabled={Boolean(reason)}
                onChange={() => onChange(p)} className="sr-only" />
              {selected && (
                <motion.span layoutId="preset-outline" aria-hidden="true"
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                  className="pointer-events-none absolute -inset-px rounded-2xl border border-primary/80 shadow-[inset_0_0_0_1px_var(--primary),0_18px_50px_-24px_var(--primary)]" />
              )}
              {p.recommended && (
                <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl bg-[radial-gradient(60%_120%_at_12%_0%,rgb(255_122_46/0.14),transparent_70%)]" />
              )}

              <span className="relative flex items-start justify-between gap-3">
                <span className={`flex size-9 items-center justify-center rounded-xl border sm:size-10 transition-colors duration-300 ${
                  selected ? "border-primary/40 bg-primary/15 text-primary" : "border-border bg-background text-muted group-hover:text-foreground"}`}>
                  <Icon className="size-5" />
                </span>
                <span className="flex items-center gap-2">
                  {p.recommended && (
                    <span className="rounded-full border border-primary/30 bg-primary-soft px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
                      Recommended
                    </span>
                  )}
                  <span aria-hidden="true" className={`flex size-5 items-center justify-center rounded-full border transition-colors duration-300 ${
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border-strong"}`}>
                    {selected && <CheckIcon className="size-3.5" strokeWidth={2.4} />}
                  </span>
                </span>
              </span>

              <span className={`relative mt-3 sm:mt-4 ${p.recommended ? "sm:flex sm:items-baseline sm:gap-3" : ""}`}>
                <span className="block font-medium text-foreground">{p.title}</span>
                <span className="block font-mono text-[11px] uppercase tracking-wider text-subtle">{presetMeta(p.patch)}</span>
              </span>
              <span className="relative mt-1.5 block text-sm leading-relaxed text-muted">{reason || p.blurb}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
