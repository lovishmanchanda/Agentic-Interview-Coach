/** A placeholder block with a slow light sweep, shown where content is loading. Size it with className. */
export default function Skeleton({ className = "h-4 w-full" }) {
  return (
    <div aria-hidden="true"
      className={`relative overflow-hidden rounded-lg bg-raised before:absolute before:inset-0 before:-translate-x-full before:animate-shimmer before:bg-gradient-to-r before:from-transparent before:via-white/[0.05] before:to-transparent ${className}`} />
  );
}

/** A few skeleton lines laid out like a paragraph, with a status for screen readers. */
export function SkeletonText({ lines = 3, label = "Loading" }) {
  return (
    <div role="status" aria-label={label} className="space-y-2.5">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className={`h-3.5 ${i === lines - 1 ? "w-2/3" : "w-full"}`} />
      ))}
    </div>
  );
}
