"use client";

import { InterviewerAvatar, MentorAvatar } from "@/components/brand/AgentAvatar";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import { SparkIcon } from "@/components/ui/icons";

const STEPS = [
  { title: "Take the seat", body: "VERA asks, follows up when an answer is thin, and scores each one.", Visual: () => <InterviewerAvatar size="size-10" active /> },
  { title: "Read your report", body: "What went well, what cost you marks, with the evidence. It lands on this desk.", Visual: () => (
    <span className="flex h-10 w-8 items-center justify-center rounded-[3px] bg-[#b9b4aa] font-mono text-[10px] font-bold text-[#1a1a1d]">7.4</span>
  ) },
  { title: "Improve with ARIA", body: "Ask what went wrong; she answers from your reports and sends you into a drill.", Visual: () => <MentorAvatar size="size-10" active /> },
];

/** A new desk: how the loop works, in three steps, until the first report arrives. */
export default function EmptyDesk() {
  return (
    <section aria-labelledby="empty-desk-title" className="rounded-3xl border border-dashed border-border-strong p-6 sm:p-8">
      <p className="eyebrow flex items-center gap-2"><SparkIcon className="size-4" /> How your desk fills up</p>
      <h2 id="empty-desk-title" className="mt-3 text-2xl font-semibold tracking-tight">
        Your desk is <span className="font-serif font-normal italic">empty</span> for now.
      </h2>
      <Stagger as="ol" className="mt-6 grid gap-4 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <StaggerItem as="li" key={s.title} className="rounded-2xl border border-border bg-surface p-5">
            <div className="flex items-center justify-between">
              <s.Visual />
              <span className="font-mono text-xs text-subtle">0{i + 1}</span>
            </div>
            <p className="mt-4 font-medium">{s.title}</p>
            <p className="mt-1 text-sm text-muted">{s.body}</p>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
