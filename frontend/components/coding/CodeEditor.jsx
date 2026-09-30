"use client";

import Editor from "@monaco-editor/react";

const MONACO_LANGUAGE = { python: "python", javascript: "javascript", java: "java", cpp: "cpp", c: "c" };
export const EDITOR_BACKGROUND = "#0e0e10";

/**
 * The room's own editor theme: graphite background, grey gutter, an orange cursor and bracket match, steel
 * selection, and a restrained syntax palette (orange keywords, steel types, muted comments), so the editor
 * looks like part of InterviewOS rather than a pasted-in VS Code.
 */
function defineTheme(monaco) {
  monaco.editor.defineTheme("interviewos", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "84848c", fontStyle: "italic" },
      { token: "keyword", foreground: "ff9a5c" },
      { token: "string", foreground: "b7c7de" },
      { token: "number", foreground: "f5d06a" },
      { token: "type", foreground: "7c93b5" },
      { token: "type.identifier", foreground: "9fb3cf" },
      { token: "delimiter", foreground: "9d9da5" },
    ],
    colors: {
      "editor.background": EDITOR_BACKGROUND,
      "editor.foreground": "#ededed",
      "editorLineNumber.foreground": "#44444a",
      "editorLineNumber.activeForeground": "#a0a0a8",
      "editor.lineHighlightBackground": "#16161a",
      "editor.lineHighlightBorder": "#00000000",
      "editorCursor.foreground": "#ff7a2e",
      "editor.selectionBackground": "#7c93b547",
      "editor.inactiveSelectionBackground": "#7c93b526",
      "editorBracketMatch.background": "#ff7a2e1f",
      "editorBracketMatch.border": "#ff7a2e8c",
      "editorIndentGuide.background1": "#1d1d21",
      "editorIndentGuide.activeBackground1": "#34343a",
      "editorWidget.background": "#1a1a1d",
      "editorWidget.border": "#34343a",
      "editorSuggestWidget.background": "#1a1a1d",
      "editorSuggestWidget.border": "#34343a",
      "editorSuggestWidget.selectedBackground": "#26262a",
      "editorHoverWidget.background": "#1a1a1d",
      "editorHoverWidget.border": "#34343a",
      "scrollbarSlider.background": "#34343a80",
      "scrollbarSlider.hoverBackground": "#4a4a52a0",
      "editorGutter.background": EDITOR_BACKGROUND,
      focusBorder: "#00000000",
    },
  });
}

/**
 * Monaco (the VS Code editor). Nothing is sent while typing: the room autosaves a draft every few seconds and
 * sends code only on Run or Submit. Monaco's files load from its CDN on first use.
 */
export default function CodeEditor({ language, value, onChange, readOnly = false, label }) {
  return (
    <div role="group" aria-label={label}>
      <Editor
        height="clamp(320px, 52vh, 600px)"
        language={MONACO_LANGUAGE[language] || "plaintext"}
        theme="interviewos"
        beforeMount={defineTheme}
        value={value}
        onChange={(v) => onChange(v ?? "")}
        loading={<p className="p-4 font-mono text-xs text-muted">Loading the editor…</p>}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace",
          fontLigatures: true,
          lineHeight: 22,
          padding: { top: 14, bottom: 14 },
          tabSize: language === "python" ? 4 : 2,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          renderLineHighlight: "line",
          cursorBlinking: "smooth",
          cursorSmoothCaretAnimation: "on",
          smoothScrolling: true,
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8, useShadows: false },
          ariaLabel: label,
        }}
      />
    </div>
  );
}
