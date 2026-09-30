/** A square button holding only an icon. `label` is required: it's the button's accessible name and tooltip. */
export default function IconButton({ label, size = "md", className = "", children, ...props }) {
  const box = size === "sm" ? "size-9" : "size-11";
  return (
    <button type="button" aria-label={label} title={label}
      className={`inline-flex ${box} items-center justify-center rounded-xl border border-border text-muted transition-colors hover:border-border-strong hover:bg-raised hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 ${className}`}
      {...props}>
      {children}
    </button>
  );
}
