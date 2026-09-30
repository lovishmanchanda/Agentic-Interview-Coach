/** A keyboard key, drawn as a small key-cap: <Kbd>⌘</Kbd><Kbd>K</Kbd>. */
export default function Kbd({ children, className = "" }) {
  return (
    <kbd className={`inline-flex h-5 min-w-5 items-center justify-center rounded-[5px] border border-border-strong bg-raised px-1.5 font-mono text-[11px] font-medium text-muted shadow-[inset_0_-1px_0_var(--border-strong)] ${className}`}>
      {children}
    </kbd>
  );
}
