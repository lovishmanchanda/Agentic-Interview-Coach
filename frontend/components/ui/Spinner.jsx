export default function Spinner({ className = "size-5", label }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2 text-muted">
      <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeOpacity="0.25" strokeWidth="4" />
        <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
      </svg>
      {label && <span className="text-sm">{label}</span>}
    </span>
  );
}
