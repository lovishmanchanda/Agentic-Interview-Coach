/**
 * The standard container. Variants:
 *   surface (default) the everyday card
 *   raised            a step brighter, with the faint top highlight
 *   lamp              "under the lamp": the one next thing to do (orange tint). At most one per screen.
 */
const VARIANTS = {
  surface: "border border-border bg-surface",
  raised: "elevated",
  lamp: "border border-primary/35 bg-[linear-gradient(to_bottom,var(--primary-soft),var(--surface)_85%)]",
};

export default function Card({ title, description, action, variant = "surface", className = "", children }) {
  return (
    <section className={`rounded-2xl p-5 sm:p-6 ${VARIANTS[variant]} ${className}`}>
      {(title || action) && (
        <header className="mb-4 flex items-start justify-between gap-4">
          <div>
            {title && <h2 className="text-base font-semibold text-foreground">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {action}
        </header>
      )}
      {children}
    </section>
  );
}
