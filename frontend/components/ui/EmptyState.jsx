/** What an empty list or first-time screen shows: an icon in a soft ring, a title, a line, and one action. */
export default function EmptyState({ icon: IconComponent, title, body, action, className = "" }) {
  return (
    <div className={`flex flex-col items-center rounded-2xl border border-dashed border-border-strong px-6 py-12 text-center ${className}`}>
      {IconComponent && (
        <span className="flex size-12 items-center justify-center rounded-full border border-border bg-raised text-muted">
          <IconComponent className="size-5" />
        </span>
      )}
      <p className="mt-4 font-medium">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
