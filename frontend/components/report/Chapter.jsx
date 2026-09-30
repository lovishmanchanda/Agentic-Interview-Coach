import Reveal from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";

/**
 * One chapter of the report's story: a mono number, a heading whose words rise in, an optional line under it,
 * then the content lifting in as it scrolls into view.
 */
export default function Chapter({ number, title, description, action, id, children }) {
  return (
    <section aria-labelledby={id} className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4 border-t border-border pt-8">
        <div>
          <p className="eyebrow">{String(number).padStart(2, "0")}</p>
          <SplitHeading id={id} text={title} className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl" />
          {description && <p className="mt-2 max-w-2xl text-sm text-muted">{description}</p>}
        </div>
        {action}
      </header>
      <Reveal>{children}</Reveal>
    </section>
  );
}
