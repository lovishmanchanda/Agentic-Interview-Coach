"use client";

import { useEffect, useRef } from "react";

import Button from "@/components/ui/Button";

const MAX_CHARS = 2000;
const MAX_HEIGHT_PX = 160;

/** Enter sends, Shift+Enter adds a line. Grows with the text up to a few lines. */
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

  return (
    <form onSubmit={submit} className="flex items-end gap-3">
      <div className="flex-1">
        <label htmlFor="mentor-input" className="sr-only">Message the Mentor</label>
        <textarea id="mentor-input" ref={ref} rows={1} value={value} maxLength={MAX_CHARS}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) submit(e);
          }}
          placeholder="Ask about your interviews…"
          aria-describedby="mentor-input-hint"
          className="block max-h-40 min-h-11 w-full resize-none rounded-xl border border-border bg-surface px-4 py-2.5 text-sm leading-6 focus:border-primary focus:outline-none" />
        <p id="mentor-input-hint" className="mt-1 flex justify-between px-1 text-[11px] text-muted">
          <span>Enter to send · Shift+Enter for a new line</span>
          {value.length > MAX_CHARS - 200 && <span className="tabular-nums">{value.length}/{MAX_CHARS}</span>}
        </p>
      </div>
      <Button type="submit" className="mb-5" disabled={!value.trim()} loading={sending}>Send</Button>
    </form>
  );
}
