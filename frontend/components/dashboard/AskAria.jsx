"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { MentorAvatar } from "@/components/brand/AgentAvatar";
import { ArrowRightIcon } from "@/components/ui/icons";

/**
 * Ask ARIA without leaving the desk: type a question (or pick one built from your results) and it opens in
 * ARIA's chat, ready to send. Under it, your latest company preparation plan, if you have one.
 */
export default function AskAria({ prompts, plan }) {
  const router = useRouter();
  const [question, setQuestion] = useState("");
  const ask = (q) => q.trim() && router.push(`/mentor?q=${encodeURIComponent(q.trim())}`);

  return (
    <div className="flex h-full flex-col gap-5">
      <div className="flex items-center gap-3">
        <MentorAvatar size="size-10" />
        <div>
          <p className="font-semibold">Ask <span className="text-primary">ARIA</span></p>
          <p className="text-xs text-muted">She answers from your own reports, with the sessions cited.</p>
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="relative">
        <label htmlFor="ask-aria" className="sr-only">Ask ARIA a question</label>
        <input id="ask-aria" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What should I work on next?"
          className="h-12 w-full rounded-xl border border-border-strong bg-background/60 pl-4 pr-12 text-[15px] placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
        <button type="submit" aria-label="Ask" disabled={!question.trim()}
          className="absolute inset-y-1.5 right-1.5 flex w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity disabled:opacity-30">
          <ArrowRightIcon className="size-4" />
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {prompts.map((p) => (
          <button key={p} type="button" onClick={() => ask(p)}
            className="rounded-full border border-border px-3 py-1.5 text-left pointer-coarse:min-h-11 text-xs text-muted transition-colors hover:border-primary/50 hover:text-foreground">
            {p}
          </button>
        ))}
      </div>
      {plan && (
        <Link href="/mentor" className="group mt-auto flex items-center gap-3 rounded-xl border border-border bg-background/50 p-3 transition-colors hover:border-border-strong">
          <span className="font-mono text-[11px] uppercase tracking-wider text-primary">Plan</span>
          <span className="min-w-0 flex-1 truncate text-sm">
            {plan.company_name} · {plan.estimated_weeks} week{plan.estimated_weeks === 1 ? "" : "s"}
          </span>
          <ArrowRightIcon className="size-4 text-subtle group-hover:text-foreground" />
        </Link>
      )}
    </div>
  );
}
