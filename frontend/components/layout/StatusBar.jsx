"use client";

import Link from "next/link";

import { InterviewerAvatar, MentorAvatar } from "@/components/brand/AgentAvatar";
import Kbd from "@/components/ui/Kbd";
import { useShellStore } from "@/store/shellStore";

/**
 * The OS status line along the bottom (desktop): VERA's and ARIA's state, your streak, and the ⌘K hint.
 * Everything in it comes from your own data; nothing is invented.
 */
export default function StatusBar() {
  const { status, inProgress, reports, pendingReports, mentorAvailable, streak } = useShellStore();
  const ready = status === "ready";

  const aria = !mentorAvailable ? "offline"
    : pendingReports ? `reading ${pendingReports} new report${pendingReports > 1 ? "s" : ""}`
      : reports ? `knows ${reports} report${reports > 1 ? "s" : ""}` : "waiting for your first report";

  return (
    <footer aria-label="Status" className="sticky bottom-0 z-20 hidden h-9 items-center gap-5 border-t border-border/60 bg-background/70 px-4 font-mono text-[11px] text-muted backdrop-blur-xl md:flex md:px-8">
      {inProgress ? (
        <Link href={`/interview/session/${inProgress.session_id}`} className="flex items-center gap-2 hover:text-foreground">
          <InterviewerAvatar active size="size-4" /> VERA · interview in progress
        </Link>
      ) : (
        <span className="flex items-center gap-2"><InterviewerAvatar size="size-4" /> VERA · ready</span>
      )}
      <span className="flex items-center gap-2"><MentorAvatar active={pendingReports > 0} size="size-4" /> ARIA · {ready ? aria : "…"}</span>
      {ready && streak > 0 && <span>{streak}-day streak</span>}
      <span className="ml-auto flex items-center gap-1.5">Quick actions <Kbd>⌘K</Kbd></span>
    </footer>
  );
}
