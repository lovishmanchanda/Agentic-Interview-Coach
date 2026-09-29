"use client";

import Editor from "@monaco-editor/react";
import { useSyncExternalStore } from "react";

const MONACO_LANGUAGE = { python: "python", javascript: "javascript", java: "java", cpp: "cpp", c: "c" };
const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange) {
  const query = window.matchMedia(DARK_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function usePrefersDark() {
  return useSyncExternalStore(subscribe, () => window.matchMedia(DARK_QUERY).matches, () => false);
}

/**
 * Monaco (the VS Code editor). Nothing is sent while typing: the page autosaves a draft every few seconds and
 * sends code only on Run or Submit. Monaco's files load from its CDN on first use (self-hosting: Phase 7).
 */
export default function CodeEditor({ language, value, onChange, readOnly = false, label }) {
  const dark = usePrefersDark();
  return (
    <div className="overflow-hidden rounded-xl border border-border" role="group" aria-label={label}>
      <Editor
        height="clamp(320px, 50vh, 560px)"
        language={MONACO_LANGUAGE[language] || "plaintext"}
        theme={dark ? "vs-dark" : "light"}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        loading={<p className="p-4 text-sm text-muted">Loading the editor…</p>}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          tabSize: language === "python" ? 4 : 2,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          ariaLabel: label,
        }}
      />
    </div>
  );
}
