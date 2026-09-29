"use client";

import { useEffect, useRef } from "react";

import Spinner from "@/components/ui/Spinner";

import ChatBubble from "./ChatBubble";

/** The message list. Keeps the newest message in view as replies arrive. */
export default function MentorChat({ messages, sending }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  return (
    <div>
      <ol className="space-y-4" aria-live="polite" aria-relevant="additions">
        {messages.map((m) => <ChatBubble key={m.message_id} message={m} />)}
        {sending && (
          <li className="max-w-[85%]">
            <div className="inline-flex rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3">
              <Spinner label="Mentor is thinking…" />
            </div>
          </li>
        )}
      </ol>
      {/* The margin keeps the newest message clear of the sticky input when scrolled into view. */}
      <div ref={bottomRef} className="scroll-mb-32" />
    </div>
  );
}
