"use client";

import { useEffect, useRef } from "react";

import Spinner from "@/components/ui/Spinner";
import { ArrowRightIcon } from "@/components/ui/icons";

const MAX_CHARS = 2000;
const MAX_HEIGHT_PX = 160;

/**
 * The message box: one rounded field with the send button inside it. Enter sends, Shift+Enter adds a line;
 * it grows with the text up to a few lines. The border warms to orange while you type in it.
 */
export default function MentorInput({ value, onChange, onSend, sending, autoFocus = false }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`;
  }, [value]);

  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);

  function submit(event) {
    event.preventDefault();
    if (value.trim() && !sending) onSend(value);
  }

  const ready = value.trim() && !sending;
  return (
    <form onSubmit={submit}>
      <div className="flex items-end gap-2 rounded-2xl border border-border-strong bg-surface/95 p-1.5 pl-4 shadow-[0_-20px_60px_-30px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-[border-color,box-shadow] duration-200 focus-within:border-primary/60 focus-within:ring-4 focus-within:ring-primary/10">
        <label htmlFor="mentor-input" className="sr-only">Message ARIA</label>
        <textarea id="mentor-input" ref={ref} rows={1} value={value} maxLength={MAX_CHARS}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          placeholder="Ask ARIA about your interviews…"
          aria-describedby="mentor-input-hint"
          className="block max-h-40 min-h-10 flex-1 resize-none bg-transparent py-2 text-sm leading-6 text-foreground placeholder:text-subtle focus:outline-none" />
        <button type="submit" disabled={!ready} aria-label="Send"
          className={`flex size-10 shrink-0 items-center justify-center rounded-xl transition-[background-color,color,transform] duration-200 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
            ready ? "bg-primary text-primary-foreground shadow-[0_8px_24px_-10px_var(--primary)] hover:bg-primary-hover" : "bg-raised text-subtle"}`}>
          {sending ? <Spinner className="size-4" /> : <ArrowRightIcon className="size-4 -rotate-90" />}
        </button>
      </div>
      <p id="mentor-input-hint" className="mt-1.5 flex justify-between px-2 text-[11px] text-subtle">
        <span>Enter to send · Shift+Enter for a new line</span>
        {value.length > MAX_CHARS - 200 && <span className="tabular-nums">{value.length}/{MAX_CHARS}</span>}
      </p>
    </form>
  );
}
