"use client";

import { useId, useState } from "react";

const MAX_SKILLS = 50;

export default function SkillsInput({ value, onChange, suggestions = [] }) {
  const id = useId();
  const [draft, setDraft] = useState("");
  const normalized = new Set(value.map((s) => s.toLowerCase()));

  function add(skill) {
    const clean = skill.trim().replace(/\s+/g, " ");
    if (!clean || normalized.has(clean.toLowerCase()) || value.length >= MAX_SKILLS) return;
    onChange([...value, clean]);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === ",") {
      event.preventDefault();
      add(draft);
      setDraft("");
    } else if (event.key === "Backspace" && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  }

  const remainingSuggestions = suggestions.filter((s) => !normalized.has(s.toLowerCase()));

  return (
    <div className="space-y-3">
      <label htmlFor={id} className="block text-sm font-medium">
        Skills
      </label>
      <div className="flex min-h-12 flex-wrap items-center gap-2 rounded-lg border border-border bg-surface p-2 focus-within:border-primary">
        {value.map((skill) => (
          <span key={skill} className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-sm text-primary">
            {skill}
            <button type="button" onClick={() => onChange(value.filter((s) => s !== skill))} aria-label={`Remove ${skill}`} className="rounded-full px-1 hover:bg-primary/10">
              ×
            </button>
          </span>
        ))}
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            add(draft);
            setDraft("");
          }}
          placeholder={value.length ? "Add another…" : "Type a skill and press Enter"}
          className="min-w-40 flex-1 bg-transparent px-1 py-1 text-sm outline-none"
        />
      </div>
      {remainingSuggestions.length > 0 && (
        <div>
          <p className="mb-2 text-xs text-muted">Suggestions for your role</p>
          <div className="flex flex-wrap gap-2">
            {remainingSuggestions.map((skill) => (
              <button
                key={skill}
                type="button"
                onClick={() => add(skill)}
                className="rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted hover:border-primary hover:text-primary"
              >
                + {skill}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
