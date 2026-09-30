"use client";

import { useState } from "react";

import NumberTicker from "@/components/motion/NumberTicker";
import Reveal, { Stagger, StaggerItem } from "@/components/motion/Reveal";
import RoomScene from "@/components/three/RoomScene";
import Button from "@/components/ui/Button";

const SAMPLE_DESK = {
  reports: [
    { id: "r3", score: 7.4, label: "Technical · DSA", date: "30 Sep 2026" },
    { id: "r2", score: 6.1, label: "Behavioural", date: "27 Sep 2026" },
    { id: "r1", score: 5.2, label: "Technical · DBMS", date: "24 Sep 2026" },
  ],
  nextStep: { title: "Drill system design", detail: "Your weakest topic: 4.6" },
};

/** The interview room on /design: switch presets to see the camera, chair and lights move between them. */
export default function RoomDemo() {
  const [preset, setPreset] = useState("landing");
  const [progress, setProgress] = useState(0);
  const [lightOn, setLightOn] = useState(false);
  const [clicked, setClicked] = useState(null);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {["landing", "auth", "desk"].map((p) => (
          <Button key={p} size="sm" variant={preset === p ? "primary" : "secondary"} onClick={() => setPreset(p)}>{p}</Button>
        ))}
        <label className="ml-2 flex items-center gap-2 text-sm text-muted">
          Scroll dolly
          <input type="range" min="0" max="1" step="0.01" value={progress} disabled={preset !== "landing"}
            onChange={(e) => setProgress(Number(e.target.value))} className="accent-[var(--primary)]" />
        </label>
        <Button size="sm" variant="ghost" onMouseEnter={() => setLightOn(true)} onMouseLeave={() => setLightOn(false)}
          onFocus={() => setLightOn(true)} onBlur={() => setLightOn(false)}>
          Hover me: warm light
        </Button>
        {clicked && <span className="text-sm text-muted">Clicked: <span className="font-mono text-foreground">{clicked}</span></span>}
      </div>
      <RoomScene
        className="relative h-[28rem] overflow-hidden rounded-xl border border-border"
        preset={preset}
        progress={progress}
        lightOn={lightOn}
        parallax
        label="The interview room"
        desk={{ ...SAMPLE_DESK, onOpenReport: (id) => setClicked(`report ${id}`), onNextStep: () => setClicked("next step") }}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        {[["Interviews", 7, 0], ["Latest score", 7.4, 1], ["Day streak", 4, 0]].map(([label, value, decimals], i) => (
          <Reveal key={label} delay={i * 0.08} className="elevated rounded-xl p-4">
            <p className="text-xs text-muted">{label}</p>
            <p className="mt-1 text-3xl font-semibold"><NumberTicker value={value} decimals={decimals} /></p>
          </Reveal>
        ))}
      </div>
      <Stagger className="flex flex-wrap gap-2">
        {["Reveal", "Stagger", "NumberTicker", "PageTransition", "SmoothScroll"].map((name) => (
          <StaggerItem key={name} className="rounded-full border border-border px-3 py-1 font-mono text-xs text-muted">{name}</StaggerItem>
        ))}
      </Stagger>
    </div>
  );
}
