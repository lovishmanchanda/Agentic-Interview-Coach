/**
 * An endless, slow horizontal band. The content is rendered twice and slid by half its width, so the loop is
 * seamless; the edges fade out. Pauses on hover. Decorative: screen readers get the list once.
 */
export default function Marquee({ items, className = "", duration = 40 }) {
  const row = (hidden) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center gap-10 pr-10">
      {items.map((item, i) => (
        <li key={`${item}-${i}`} className="flex items-center gap-10 whitespace-nowrap">
          <span className={i % 2 ? "font-serif text-[1.35em] italic text-foreground" : "text-muted"}>{item}</span>
          <span aria-hidden="true" className="size-1.5 rounded-full bg-primary/70" />
        </li>
      ))}
    </ul>
  );
  return (
    <div className={`group relative flex overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)] ${className}`}>
      <div className="flex w-max animate-marquee group-hover:[animation-play-state:paused]" style={{ animationDuration: `${duration}s` }}>
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
