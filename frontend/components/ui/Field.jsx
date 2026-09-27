"use client";

import { useId } from "react";

const CONTROL =
  "w-full rounded-lg border bg-surface px-3 text-sm text-foreground placeholder:text-muted/70 transition-colors focus:border-primary focus:outline-none";

function FieldShell({ id, label, hint, error, required, children }) {
  return (
    <div className="space-y-1.5">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-danger"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-xs text-danger">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="text-xs text-muted">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function describedBy(id, error, hint) {
  if (error) return `${id}-error`;
  return hint ? `${id}-hint` : undefined;
}

export function Input({ label, hint, error, required, className = "", ...props }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <input
        id={id}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} h-10 ${error ? "border-danger" : "border-border"} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Textarea({ label, hint, error, required, className = "", ...props }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <textarea
        id={id}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} min-h-28 py-2 ${error ? "border-danger" : "border-border"} ${className}`}
        {...props}
      />
    </FieldShell>
  );
}

export function Select({ label, hint, error, required, options, className = "", ...props }) {
  const id = useId();
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <select
        id={id}
        required={required}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={describedBy(id, error, hint)}
        className={`${CONTROL} h-10 ${error ? "border-danger" : "border-border"} ${className}`}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}
