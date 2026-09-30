/**
 * InterviewOS brand. The mark is the empty interview chair under a cone of light ("take the seat"); the
 * wordmark sets "OS" in mono on a key-cap. Both are plain SVG/HTML so they render anywhere, server or client.
 */
import { useId } from "react";

export function LogoMark({ className = "size-8", title }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}
      aria-label={title} fill="none">
      <defs>
        <linearGradient id={`${id}-cone`} x1="16" y1="2" x2="16" y2="27" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--primary)" stopOpacity="0.95" />
          <stop offset="1" stopColor="var(--primary)" stopOpacity="0.05" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill="var(--raised)" />
      <path d="M16 3 L8 26 H24 Z" fill={`url(#${id}-cone)`} opacity="0.55" />
      <ellipse cx="16" cy="26.5" rx="7.5" ry="1.6" fill="var(--primary)" opacity="0.45" />
      {/* The chair, side on: backrest, seat, two legs */}
      <path d="M10.8 11 L12.6 20 H20.6 M12.6 20 L11.6 26.4 M20.6 20 L21.5 26.4" stroke="var(--foreground)" strokeWidth="1.9"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M12.1 23.4 H21" stroke="var(--foreground)" strokeWidth="1.1" strokeLinecap="round" opacity="0.55" />
      <circle cx="16" cy="3.4" r="1.4" fill="var(--primary)" />
    </svg>
  );
}

export function Wordmark({ className = "" }) {
  return (
    <span className={`inline-flex items-center gap-1 font-semibold tracking-tight text-foreground ${className}`}>
      Interview
      <span className="rounded-[5px] border border-border-strong bg-raised px-1 py-px font-mono text-[0.72em] font-medium leading-none text-primary shadow-[inset_0_-1px_0_0_var(--border-strong)]">
        OS
      </span>
    </span>
  );
}

export default function Logo({ className = "", markClassName = "size-8" }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark className={markClassName} />
      <Wordmark />
    </span>
  );
}
