"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

import { MentorAvatar } from "@/components/brand/AgentAvatar";

import ChatBubble from "./ChatBubble";
import PrepProgress from "./PrepProgress";

/** A reply as plain text for screen readers: no markdown marks, citations as "(source n)". */
function plain(markdown) {
  return markdown.replace(/\[(\d+)\]/g, " (source $1)").replace(/[*_`#>|]/g, "").replace(/\s+/g, " ").trim();
}

/** ARIA writing: her lamp breathing and three warm dots, with what she's doing. */
function Typing({ reportCount }) {
  const what = reportCount > 1 ? `reviewing your ${reportCount} reports` : reportCount === 1 ? "reviewing your report" : "thinking";
  return (
    <span className="inline-flex items-center gap-3" role="status">
      <MentorAvatar active size="size-7" />
      <span aria-hidden="true" className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <motion.span key={i} className="size-1.5 rounded-full bg-primary"
            animate={{ y: [0, -4, 0], opacity: [0.35, 1, 0.35] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }} />
        ))}
      </span>
      <span className="text-sm text-muted"><span className="font-medium text-foreground">ARIA</span> is {what}…</span>
    </span>
  );
}

/**
 * The message list. Messages already in the conversation when it opened just appear; new ones spring in and
 * ARIA's replies write themselves out. Screen readers hear each new reply once, in full, from a polite live
 * region (the visual text is revealed progressively, so it isn't itself live). Keeps the newest in view.
 */
export default function MentorChat({ messages, sending, pendingKind, reportCount = 0 }) {
  const bottomRef = useRef(null);
  const [history] = useState(() => new Set(messages.map((m) => m.message_id)));
  const latest = messages.at(-1);
  const announcement = latest?.role === "assistant" && !history.has(latest.message_id) ? `ARIA: ${plain(latest.content)}` : "";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, sending]);

  return (
    <div>
      <p className="sr-only" aria-live="polite">{announcement}</p>
      <ol className="space-y-5">
        {messages.map((m) => (
          <ChatBubble key={m.message_id} message={m}
            animate={m.role === "user" ? Boolean(m.pending) : !history.has(m.message_id)} />
        ))}
        <AnimatePresence>
          {sending && (
            <motion.li key="typing" className="max-w-[85%]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.15 } }} transition={{ type: "spring", stiffness: 380, damping: 30 }}>
              <div className="inline-flex rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3">
                {pendingKind === "prep"
                  ? <PrepProgress withJd={Boolean(messages.at(-1)?.content?.includes("job description"))} />
                  : <Typing reportCount={reportCount} />}
              </div>
            </motion.li>
          )}
        </AnimatePresence>
      </ol>
      {/* The margin keeps the newest message clear of the sticky input when scrolled into view. */}
      <div ref={bottomRef} className="scroll-mb-40" />
    </div>
  );
}
