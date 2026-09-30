"use client";

import Marquee from "@/components/motion/Marquee";
import NumberTicker from "@/components/motion/NumberTicker";
import { Stagger, StaggerItem } from "@/components/motion/Reveal";

const TOPICS = ["Data structures", "System design", "STAR stories", "Databases", "Live coding", "Operating systems",
  "Follow-up questions", "Object-oriented design", "Machine learning", "Company prep"];

/** The slow band of everything you can practise, under the hero. */
export function TopicBand() {
  return (
    <div className="border-y border-border bg-surface/40 py-6 text-lg md:text-xl" aria-label="Topics you can practise">
      <Marquee items={TOPICS} duration={45} />
    </div>
  );
}

// Facts about the product, taken from the seed data and the app itself (keep them true when those change).
const FACTS = [
  { value: 8, label: "topic areas", note: "from DSA to behavioural" },
  { value: 18, label: "coding problems", note: "each with hidden tests" },
  { value: 3, label: "interview types", note: "technical · behavioural · coding" },
  { value: 2, label: "modes", note: "practice, and serious" },
];

export function FactsBand() {
  return (
    <section aria-label="InterviewOS in numbers" className="mx-auto max-w-7xl px-5 sm:px-6">
      <Stagger as="dl" className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-border bg-border md:grid-cols-4">
        {FACTS.map((f) => (
          <StaggerItem key={f.label} className="bg-background p-6 sm:p-8">
            <dt className="sr-only">{f.label}</dt>
            <dd>
              <p className="font-serif text-6xl italic tracking-tight sm:text-7xl"><NumberTicker value={f.value} /></p>
              <p className="mt-3 text-sm font-medium">{f.label}</p>
              <p className="text-xs text-muted">{f.note}</p>
            </dd>
          </StaggerItem>
        ))}
      </Stagger>
    </section>
  );
}
