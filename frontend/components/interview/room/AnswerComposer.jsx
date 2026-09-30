"use client";

import { useLayoutEffect } from "react";

import Button from "@/components/ui/Button";
import { ArrowRightIcon, BulbIcon } from "@/components/ui/icons";
import Kbd from "@/components/ui/Kbd";

const MIN_HEIGHT = 96;

/**
 * Where you answer: docked to the bottom of the room so the question above stays in view. The box grows with
 * what you type (up to ~30% of the screen, then scrolls), ⌘/Ctrl + Enter submits, and the timer, the hint and
 * the character count sit in its footer. While VERA is busy it stays in place, disabled, so nothing jumps.
 */
export default function AnswerComposer({
  textareaRef: ref, value, onChange, onSubmit, maxLength, waiting, processing, timer, serious, hintsLeft, hintLoading, onHint,
}) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(MIN_HEIGHT, el.scrollHeight)}px`;
  }, [value, ref]);

  const near = value.length > maxLength * 0.9;
  return (
    <form onSubmit={onSubmit}
      className="sticky bottom-0 z-20 -mx-4 bg-gradient-to-t from-background from-70% to-transparent px-4 pb-4 pt-8 md:-mx-8 md:px-8">
      <div className={`rounded-2xl border bg-surface/95 shadow-[0_-20px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10 ${
        waiting ? "border-border-strong" : "border-border"}`}>
        <label htmlFor="answer" className="sr-only">Your answer</label>
        <textarea
          ref={ref}
          id="answer"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) onSubmit(e);
          }}
          maxLength={maxLength}
          disabled={!waiting}
          rows={3}
          placeholder={waiting ? "Type your answer…" : "Waiting for VERA…"}
          className="block max-h-[30vh] w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed text-foreground placeholder:text-subtle focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-border px-3 py-2">
          {timer}
          <span className={`text-xs tabular-nums max-sm:hidden ${near ? "text-warning" : "text-subtle"}`}>{value.length}/{maxLength}</span>
          <span className="ml-auto flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs text-subtle max-md:hidden" aria-hidden="true"><Kbd>⌘</Kbd><Kbd>↵</Kbd></span>
            {!serious && (
              <Button type="button" variant="ghost" size="sm" onClick={onHint} loading={hintLoading}
                disabled={!waiting || hintsLeft < 1} title={hintsLeft < 1 ? "One hint per question" : "A nudge, not the answer"}>
                {!hintLoading && <BulbIcon className="size-4" />}
                {hintsLeft < 1 && waiting ? "Hint used" : "Hint"}
              </Button>
            )}
            <Button type="submit" size="sm" disabled={!waiting || !value.trim()} loading={processing}
              aria-keyshortcuts="Meta+Enter Control+Enter">
              Submit {!processing && <ArrowRightIcon className="size-4" />}
            </Button>
          </span>
        </div>
      </div>
      {serious && <p className="mt-2 text-center text-xs text-subtle">Serious mode: scores and feedback appear in your report at the end.</p>}
    </form>
  );
}
