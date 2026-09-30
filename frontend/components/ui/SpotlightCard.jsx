"use client";

import { useRef } from "react";

const GLOWS = {
  primary: "rgb(255 122 46 / 0.55)",
  steel: "rgb(124 147 181 / 0.6)",
  neutral: "rgb(237 237 237 / 0.35)",
};
const WASHES = {
  primary: "rgb(255 122 46 / 0.07)",
  steel: "rgb(124 147 181 / 0.08)",
  neutral: "rgb(237 237 237 / 0.04)",
};

/**
 * A card lit by the cursor: its hairline border and surface brighten where the pointer is, like a torch over
 * a dark table. The pointer position goes straight into CSS variables (no React re-render per mouse move).
 * On touch screens it's a plain card with a quiet gradient border.
 */
export default function SpotlightCard({ as: Tag = "div", glow = "neutral", className = "", innerClassName = "", children, ...props }) {
  const ref = useRef(null);

  function onPointerMove(event) {
    const node = ref.current;
    if (!node || event.pointerType === "touch") return;
    const rect = node.getBoundingClientRect();
    node.style.setProperty("--x", `${event.clientX - rect.left}px`);
    node.style.setProperty("--y", `${event.clientY - rect.top}px`);
    node.style.setProperty("--spot", "1");
  }
  function onPointerLeave() {
    ref.current?.style.setProperty("--spot", "0");
  }

  return (
    <Tag
      ref={ref}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      className={`group/spot relative rounded-3xl p-px [--spot:0] ${className}`}
      style={{
        background: `radial-gradient(520px circle at var(--x, 50%) var(--y, 0%), ${GLOWS[glow]}, transparent 42%),
          linear-gradient(to bottom, var(--border-strong), var(--border) 40%, var(--border))`,
      }}
      {...props}
    >
      <div className={`relative h-full overflow-hidden rounded-[calc(1.5rem-1px)] bg-surface ${innerClassName}`}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-[var(--spot)] transition-opacity duration-500"
          style={{ background: `radial-gradient(420px circle at var(--x, 50%) var(--y, 0%), ${WASHES[glow]}, transparent 60%)` }} />
        <div className="relative h-full">{children}</div>
      </div>
    </Tag>
  );
}
