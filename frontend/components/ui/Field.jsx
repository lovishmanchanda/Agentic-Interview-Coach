"use client";

import { useId, useState } from "react";

import { AlertIcon, EyeIcon, EyeOffIcon } from "./icons";

/**
 * Form fields: a label above, the control, then an error (with an icon, read out by screen readers through
 * aria-describedby) or a hint. Controls are 48 px tall with an orange focus glow. Password inputs get a
 * show/hide toggle.
 */
const CONTROL =
  "w-full rounded-xl border bg-background/60 px-4 text-[15px] text-foreground placeholder:text-subtle transition-[border-color,box-shadow] duration-200 focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15";

function FieldShell({ id, label, hint, error, required, children }) {
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="block text-sm font-medium text-foreground">
          {label}
          {required && <span className="text-muted" aria-hidden="true"> *</span>}
        </label>
      )}
      {children}
      {error ? (
        <p id={`${id}-error`} className="flex items-center gap-1.5 text-xs text-danger">
          <AlertIcon className="size-3.5 shrink-0" />
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

export function Input({ label, hint, error, required, className = "", type = "text", ...props }) {
  const id = useId();
  const [reveal, setReveal] = useState(false);
  const isPassword = type === "password";
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} required={required}>
      <div className="relative">
        <input
          id={id}
          type={isPassword && reveal ? "text" : type}
          required={required}
          aria-invalid={Boolean(error) || undefined}
          aria-describedby={describedBy(id, error, hint)}
          className={`${CONTROL} h-12 ${isPassword ? "pr-12" : ""} ${error ? "border-danger/70" : "border-border-strong"} ${className}`}
          {...props}
        />
        {isPassword && (
          <button type="button" onClick={() => setReveal((r) => !r)} aria-label={reveal ? "Hide password" : "Show password"}
            aria-pressed={reveal}
            className="absolute inset-y-0 right-1 my-auto flex size-10 items-center justify-center rounded-lg text-muted transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            {reveal ? <EyeOffIcon className="size-[18px]" /> : <EyeIcon className="size-[18px]" />}
          </button>
        )}
      </div>
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
        className={`${CONTROL} min-h-28 py-3 ${error ? "border-danger/70" : "border-border-strong"} ${className}`}
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
        className={`${CONTROL} h-12 ${error ? "border-danger/70" : "border-border-strong"} ${className}`}
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
