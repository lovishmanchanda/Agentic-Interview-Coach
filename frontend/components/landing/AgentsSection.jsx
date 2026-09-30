"use client";

import { motion } from "motion/react";

import { InterviewerAvatar, MentorAvatar } from "@/components/brand/AgentAvatar";
import Reveal from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";
import SpotlightCard from "@/components/ui/SpotlightCard";

const AGENTS = [
  {
    name: "VERA",
    expansion: "Virtual Evaluator & Responsive Assessor",
    role: "The interviewer",
    line: "The spotlight. Precise, neutral, and never easy on a vague answer.",
    points: ["Adapts difficulty to how you're doing", "Follows up when an answer is thin", "Live coding with real test runs", "Serious mode: no scores until the end"],
    Avatar: InterviewerAvatar,
    tone: "steel",
    glow: "rgb(124 147 181 / 0.18)",
  },
  {
    name: "ARIA",
    expansion: "Adaptive Reflection & Intelligent Assistance",
    role: "The mentor",
    line: "The desk lamp. Warm, specific, and she remembers everything.",
    points: ["Reads every report you've ever had", "Answers with citations to your sessions", "Sends you into weak-area drills", "Builds week-by-week company prep plans"],
    Avatar: MentorAvatar,
    tone: "primary",
    glow: "rgb(255 122 46 / 0.16)",
  },
];

/** Two lights, one room: the two agents side by side. */
export default function AgentsSection() {
  return (
    <section id="agents" className="relative mx-auto max-w-7xl scroll-mt-16 px-5 py-20 sm:px-6 md:py-32" aria-labelledby="agents-title">
      <Reveal className="max-w-2xl">
        <p className="eyebrow">Two lights, one room</p>
        <SplitHeading id="agents-title" text="Meet *VERA* and *ARIA.*" className="section-title mt-4" />
      </Reveal>
      <div className="mt-10 grid gap-5 md:mt-14 md:grid-cols-2">
        {AGENTS.map((a, i) => (
          <Reveal key={a.name} delay={i * 0.12}>
            <SpotlightCard as={motion.article} whileHover={{ y: -4 }} transition={{ duration: 0.3 }} glow={a.tone}
              className="group h-full" innerClassName="p-7 sm:p-8 md:p-10">
              <div aria-hidden="true" className="absolute -top-32 left-1/2 size-96 -translate-x-1/2 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-70"
                style={{ background: `radial-gradient(closest-side, ${a.glow}, transparent)` }} />
              <div className="relative">
                <a.Avatar size="size-16" active />
                <p className="eyebrow mt-8">{a.role}</p>
                <h3 className={`mt-2 font-serif text-6xl italic tracking-tight md:text-7xl ${a.tone === "steel" ? "text-steel" : "text-primary"}`}>{a.name}</h3>
                <p className="mt-1 text-sm text-muted">{a.expansion}</p>
                <p className="mt-6 text-lg">{a.line}</p>
                <ul className="mt-6 grid gap-2.5 text-sm text-muted">
                  {a.points.map((p) => (
                    <li key={p} className="flex items-center gap-3">
                      <span className={`size-1 rounded-full ${a.tone === "steel" ? "bg-steel" : "bg-primary"}`} />
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            </SpotlightCard>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
