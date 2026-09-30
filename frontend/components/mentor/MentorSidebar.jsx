"use client";

import Link from "next/link";
import { useState } from "react";

import Button from "@/components/ui/Button";

function when(iso) {
  const date = new Date(iso);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days < 1) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "short" });
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function ConversationList({ conversations, activeId, onPick }) {
  if (conversations === null) return <p className="px-2 py-3 text-xs text-muted">Loading…</p>;
  if (!conversations.length) return <p className="px-2 py-3 text-xs text-muted">Your conversations will appear here.</p>;
  return (
    <ul className="space-y-0.5">
      {conversations.map((c) => {
        const active = c.conversation_id === activeId;
        return (
          <li key={c.conversation_id}>
            <Link href={`/mentor?c=${c.conversation_id}`} onClick={onPick} aria-current={active ? "page" : undefined}
              className={`block rounded-lg px-3 py-2 text-sm ${active ? "bg-primary-soft text-primary" : "hover:bg-surface-muted"}`}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{c.title}</span>
                <span className="shrink-0 text-[11px] text-muted">{when(c.updated_at)}</span>
              </span>
              <span className="mt-0.5 block truncate text-xs text-muted">{c.last_message_preview}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** Past conversations. A column on wide screens; a collapsible list above the chat on phones. */
export default function MentorSidebar({ conversations, activeId }) {
  const [open, setOpen] = useState(false);
  const count = conversations?.length ?? 0;
  return (
    <aside aria-label="Conversations with ARIA" className="md:sticky md:top-4 md:self-start">
      <div className="flex items-center gap-2">
        <Button href="/mentor" variant="secondary" size="sm" className="flex-1 md:w-full">New conversation</Button>
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-controls="mentor-history"
          className="h-8 rounded-lg px-3 text-sm text-muted hover:bg-surface-muted hover:text-foreground md:hidden">
          History{count ? ` (${count})` : ""}
        </button>
      </div>
      <div id="mentor-history" className={`${open ? "block" : "hidden"} mt-3 max-h-[60vh] overflow-y-auto md:block md:max-h-[calc(100dvh-12rem)]`}>
        <h2 className="mb-1 hidden px-2 text-xs font-medium uppercase tracking-wide text-muted md:block">Conversations</h2>
        <ConversationList conversations={conversations} activeId={activeId} onPick={() => setOpen(false)} />
      </div>
    </aside>
  );
}
