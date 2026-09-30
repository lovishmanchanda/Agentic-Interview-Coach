"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";

import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";

function when(iso) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * The conversation list. The open one wears a warm pill that glides to whichever you pick; a conversation that
 * gets a new message moves to the top with a layout animation instead of jumping.
 */
function ConversationList({ conversations, activeId, onPick }) {
  if (conversations === null) {
    return <div className="space-y-2 px-1 py-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}</div>;
  }
  if (!conversations.length) return <p className="px-2 py-3 text-xs text-muted">Your conversations will appear here.</p>;
  return (
    <ul className="space-y-0.5">
      <AnimatePresence initial={false}>
        {conversations.map((c) => {
          const active = c.conversation_id === activeId;
          return (
            <motion.li key={c.conversation_id} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }} transition={{ type: "spring", stiffness: 420, damping: 36 }} className="relative">
              {active && (
                <motion.span layoutId="conversation-pill" aria-hidden="true" transition={{ type: "spring", stiffness: 420, damping: 36 }}
                  className="absolute inset-0 rounded-lg border border-primary/25 bg-primary-soft" />
              )}
              <Link href={`/mentor?c=${c.conversation_id}`} onClick={onPick} aria-current={active ? "page" : undefined}
                className={`relative block rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${active ? "text-foreground" : "text-muted hover:bg-raised hover:text-foreground"}`}>
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium">{c.title}</span>
                  <span className="shrink-0 text-[11px] text-subtle">{when(c.updated_at)}</span>
                </span>
                <span className="mt-0.5 block truncate text-xs text-subtle">{c.last_message_preview}</span>
              </Link>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ul>
  );
}

/** Past conversations. A column on wide screens; a collapsible list above the chat on phones. */
export default function MentorSidebar({ conversations, activeId }) {
  const [open, setOpen] = useState(false);
  const count = conversations?.length ?? 0;
  return (
    <aside aria-label="Conversations with ARIA" className="md:sticky md:top-20 md:self-start">
      <div className="flex items-center gap-2">
        <Button href="/mentor" variant="secondary" size="sm" className="flex-1 md:w-full">New conversation</Button>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mentor-history"
          className="h-9 rounded-lg px-3 text-sm text-muted hover:bg-raised hover:text-foreground md:hidden">
          History{count ? ` (${count})` : ""}
        </button>
      </div>
      <div id="mentor-history" className={`${open ? "block" : "hidden"} mt-3 max-h-[60vh] overflow-y-auto md:block md:max-h-[calc(100dvh-12rem)]`}>
        <h2 className="eyebrow mb-2 hidden px-2 text-[11px] md:block">Conversations</h2>
        <ConversationList conversations={conversations} activeId={activeId} onPick={() => setOpen(false)} />
      </div>
    </aside>
  );
}
