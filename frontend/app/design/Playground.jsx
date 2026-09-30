"use client";

import { useState } from "react";

import ScoreBars from "@/components/charts/ScoreBars";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import { Input, Select, Textarea } from "@/components/ui/Field";

const SAMPLE_SCORES = [
  { key: "dsa", label: "DSA", value: 8.2 },
  { key: "system_design", label: "System design", value: 4.6 },
  { key: "dbms", label: "DBMS", value: 6.9 },
  { key: "behavioral", label: "Behavioural", value: 7.6 },
];

/** The interactive half of /design: controls that need state. */
export default function Playground() {
  const [mode, setMode] = useState("practice");
  const [topics, setTopics] = useState(["dsa"]);

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-4">
        <Input label="Email" placeholder="you@example.com" hint="We never share it." />
        <Input label="Password" type="password" defaultValue="short" error="At least 8 characters." />
        <Select label="Difficulty" options={[{ value: "adaptive", label: "Adaptive" }, { value: "hard", label: "Hard" }]} />
        <Textarea label="Your answer" placeholder="Walk VERA through your approach…" />
        <ChoiceGroup legend="Mode" name="mode" value={mode} onChange={setMode}
          options={[{ value: "practice", label: "Practice" }, { value: "serious", label: "Serious" }]} />
        <ChoiceGroup legend="Topics" name="topics" multiple value={topics} onChange={setTopics}
          options={[{ value: "dsa", label: "DSA" }, { value: "os", label: "OS" }, { value: "dbms", label: "DBMS" },
            { value: "sd", label: "System design", disabled: true, reason: "Not for this role" }]} />
      </div>
      <ScoreBars title="Score by topic (sample)" description="Single series in the brand orange." rows={SAMPLE_SCORES} />
    </div>
  );
}
