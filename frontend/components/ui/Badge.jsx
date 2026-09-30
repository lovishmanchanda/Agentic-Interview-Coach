/** A small status pill. A dot of the tone's colour sits before the text. */
const TONES = {
  neutral: { pill: "border-border bg-raised text-muted", dot: "bg-subtle" },
  primary: { pill: "border-primary/25 bg-primary-soft text-primary", dot: "bg-primary" },
  success: { pill: "border-success/25 bg-success-soft text-success", dot: "bg-success" },
  warning: { pill: "border-warning/25 bg-warning-soft text-warning", dot: "bg-warning" },
  steel: { pill: "border-steel/25 bg-steel-soft text-steel", dot: "bg-steel" },
};

export default function Badge({ tone = "neutral", dot = true, children }) {
  const t = TONES[tone];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-medium ${t.pill}`}>
      {dot && <span aria-hidden="true" className={`size-1.5 rounded-full ${t.dot}`} />}
      {children}
    </span>
  );
}
