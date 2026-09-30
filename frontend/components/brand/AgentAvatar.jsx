/**
 * The two agents are the two lights of the interview room:
 *   VERA, the interviewer, is the cool spotlight: a thin cone that brightens while she thinks.
 *   ARIA, the mentor, is the warm desk lamp: an orange glow that breathes while she writes.
 * Decorative by default (the name is shown next to it); pass `label` when the avatar stands alone.
 * Code says interviewer/mentor, not vera/aria: `aria-*` is already HTML's accessibility prefix.
 */
import { useId } from "react";

function Frame({ label, size, tone, active, children }) {
  return (
    <span
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      data-active={active || undefined}
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border ${size} ${tone}`}
    >
      {children}
    </span>
  );
}

export function InterviewerAvatar({ active = false, label, size = "size-8" }) {
  const id = useId();
  return (
    <Frame label={label} size={size} active={active} tone="border-steel/30 bg-steel-soft">
      <svg viewBox="0 0 32 32" className={`size-full ${active ? "animate-spotlight" : ""}`} fill="none" aria-hidden="true">
        <defs>
          <linearGradient id={`${id}-beam`} x1="16" y1="4" x2="16" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#e8eef8" stopOpacity="0.95" />
            <stop offset="1" stopColor="var(--steel)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M16 5 L10 28 H22 Z" fill={`url(#${id}-beam)`} opacity="0.8" />
        <rect x="14" y="3" width="4" height="3" rx="1" fill="#e8eef8" />
        <ellipse cx="16" cy="27" rx="5" ry="1.2" fill="var(--steel)" opacity="0.6" />
      </svg>
    </Frame>
  );
}

export function MentorAvatar({ active = false, label, size = "size-8" }) {
  return (
    <Frame label={label} size={size} active={active} tone="border-primary/30 bg-primary-soft">
      <span
        aria-hidden="true"
        className={`size-3/5 rounded-full bg-[radial-gradient(circle_at_50%_45%,#ffd2b3_0%,var(--primary)_38%,transparent_70%)] ${
          active ? "animate-breathe" : "opacity-90"
        }`}
      />
    </Frame>
  );
}

export const AGENTS = {
  interviewer: { name: "VERA", role: "Interviewer", Avatar: InterviewerAvatar },
  mentor: { name: "ARIA", role: "Mentor", Avatar: MentorAvatar },
};
