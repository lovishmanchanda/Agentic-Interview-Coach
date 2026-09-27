"use client";

/**
 * A row of radio (single) or checkbox (multiple) chips. Real inputs underneath, so keyboard and screen
 * readers work as with any form control. Options: { value, label, description?, disabled?, reason? }.
 */
export default function ChoiceGroup({ legend, hint, options, value, onChange, multiple = false, name, size = "md" }) {
  const selected = (v) => (multiple ? value.includes(v) : value === v);
  const toggle = (v) => {
    if (!multiple) return onChange(v);
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };
  const pad = size === "lg" ? "px-4 py-3 text-left" : "px-3 py-1.5";

  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label
            key={o.value}
            title={o.disabled ? o.reason : undefined}
            className={`rounded-lg border text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary ${pad} ${
              o.disabled
                ? "cursor-not-allowed border-border opacity-50"
                : selected(o.value)
                  ? "cursor-pointer border-primary bg-primary-soft text-primary"
                  : "cursor-pointer border-border hover:border-primary"
            } ${size === "lg" ? "min-w-40 flex-1" : ""}`}
          >
            <input
              type={multiple ? "checkbox" : "radio"}
              name={name}
              value={o.value}
              checked={selected(o.value)}
              disabled={o.disabled}
              onChange={() => toggle(o.value)}
              className="sr-only"
            />
            <span className="font-medium">{o.label}</span>
            {size === "lg" && (o.description || o.reason) && (
              <span className="mt-0.5 block text-xs text-muted">{o.disabled ? o.reason : o.description}</span>
            )}
          </label>
        ))}
      </div>
      {hint && <p className="mt-2 text-xs text-muted">{hint}</p>}
    </fieldset>
  );
}
