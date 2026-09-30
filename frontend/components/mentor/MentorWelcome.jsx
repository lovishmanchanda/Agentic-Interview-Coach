"use client";

import { motion } from "motion/react";

import { AgentLabel } from "@/components/brand/AgentStatus";
import { MentorAvatar } from "@/components/brand/AgentAvatar";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";
import Button from "@/components/ui/Button";
import { ArrowRightIcon, ChartIcon, CheckIcon, SparkIcon, TargetIcon } from "@/components/ui/icons";
import { topicLabel } from "@/lib/interviewOptions";

const CAN_DO = [
  { Icon: CheckIcon, text: "Explain where you lost marks, citing the exact interview" },
  { Icon: SparkIcon, text: "Turn your weak areas into a study plan" },
  { Icon: ChartIcon, text: "Track how you're improving across interviews" },
  { Icon: TargetIcon, text: "Send you into a drill on your weakest topics" },
];

/** Starters built from the latest report, so the first question is one ARIA can answer well. */
function startersFor(welcome) {
  const weak = welcome.latest?.weakest_topic && topicLabel(welcome.latest.weakest_topic);
  return [
    weak ? `Why did I lose marks on ${weak}?` : "How am I doing overall?",
    weak ? `Make me a one-week study plan for ${weak}` : "What should I practise next?",
    welcome.report_count >= 2 ? "How have I progressed across my interviews?" : "What went well in my last interview?",
    "Drill me on my weak spots",
  ];
}

/**
 * What a new conversation opens with. No reports yet: what ARIA does and a first-interview CTA.
 * Otherwise ARIA greets you from your latest report (built here from real scores, no LLM call), then
 * offers starters that arrive one after another.
 */
export default function MentorWelcome({ welcome, name, onPick, onPrepare }) {
  if (!welcome.report_count) {
    return (
      <section className="relative overflow-hidden rounded-3xl border border-border bg-surface p-6 sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-56 w-72 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative">
          <MentorAvatar size="size-12" active />
          <SplitHeading text="ARIA learns from your *interviews.*" className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl" />
          <p className="mt-2 text-sm text-muted">Once you finish an interview, VERA passes its report here. Then ARIA can:</p>
          <Stagger as="ul" className="mt-5 grid gap-3 sm:grid-cols-2">
            {CAN_DO.map(({ Icon, text }) => (
              <StaggerItem as="li" key={text} className="flex gap-3 rounded-2xl border border-border bg-background/40 p-4 text-sm">
                <Icon className="mt-0.5 size-4 shrink-0 text-primary" />{text}
              </StaggerItem>
            ))}
          </Stagger>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button href="/interview/configure">Take your first interview <ArrowRightIcon className="size-4" /></Button>
            <Button variant="secondary" onClick={onPrepare}>Prepare for a company</Button>
          </div>
        </div>
      </section>
    );
  }

  const { latest } = welcome;
  const date = new Date(latest.generated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const kind = { behavioral: "behavioural", coding: "coding" }[latest.interview_type] || "technical";
  return (
    <section className="space-y-5">
      <motion.div initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 30 }} style={{ transformOrigin: "bottom left" }}
        className="relative max-w-[94%] rounded-2xl rounded-tl-md border border-border bg-surface px-4 py-3 text-sm leading-relaxed sm:max-w-[85%]">
        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-2xl rounded-tl-md bg-[radial-gradient(80%_60%_at_0%_0%,rgb(255_122_46/0.07),transparent_70%)]" />
        <div className="relative">
          <AgentLabel agent="mentor" />
          <p>
            {name ? `Welcome back, ${name}. ` : "Welcome back. "}
            Your last interview ({kind}, {date}) scored <strong className="font-semibold">{latest.overall}/10</strong>
            {latest.strongest_topic && <>, strongest in {topicLabel(latest.strongest_topic)}</>}
            {latest.weakest_topic
              ? <>{latest.strongest_topic ? ", and " : ". "}{topicLabel(latest.weakest_topic)} is the one to work on.</>
              : "."}
          </p>
          <p className="mt-2">
            {welcome.report_count === 1 ? "I've read that report" : `I've read all ${welcome.report_count} of your reports`}. What would you like to dig into?
          </p>
        </div>
      </motion.div>

      <motion.ul className="flex flex-wrap gap-2" aria-label="Suggested questions" initial="hidden" animate="shown"
        variants={{ hidden: {}, shown: { transition: { staggerChildren: 0.07, delayChildren: 0.35 } } }}>
        {startersFor(welcome).map((s) => (
          <motion.li key={s} variants={{ hidden: { opacity: 0, y: 8 }, shown: { opacity: 1, y: 0 } }}>
            <button type="button" onClick={() => onPick(s)}
              className="rounded-full border border-border-strong bg-surface px-4 py-2 text-left pointer-coarse:min-h-11 text-sm text-muted transition-colors hover:border-primary/60 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {s}
            </button>
          </motion.li>
        ))}
      </motion.ul>
      <Button variant="ghost" size="sm" onClick={onPrepare}><SparkIcon className="size-4" /> Prepare for a company interview</Button>
    </section>
  );
}
