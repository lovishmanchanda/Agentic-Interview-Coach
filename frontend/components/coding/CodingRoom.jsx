"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { PlayIcon } from "@/components/ui/icons";
import { api } from "@/lib/api";

import CodeEditor, { EDITOR_BACKGROUND } from "./CodeEditor";
import OutputPanel from "./OutputPanel";
import ProblemPanel from "./ProblemPanel";

const DRAFT_DEBOUNCE_MS = 5000; // the editor's content is autosaved; code is only *run* on Run or Submit
const MAX_CODE = 10000;
const MAX_EXPLANATION = 2000;
const FILE_NAME = { python: "solution.py", javascript: "solution.js", java: "Solution.java", cpp: "solution.cpp", c: "solution.c" };

/**
 * One coding problem: statement, editor (one buffer per language, so switching doesn't lose work), Run (the
 * visible examples, over REST, not recorded) and Submit (every test, over the socket; the server runs it and
 * sends CODE_RESULT). Rendered with key={question_id}, so a new problem starts fresh.
 *
 * Laid out like a small IDE: the problem on the left (it stays put while you scroll on wide screens), and on
 * the right an editor window with a file tab, the language and the timer, your approach, and the console.
 */
export default function CodingRoom({ sessionId, question, draftCode, waiting, submitting, submittedResult, socketRef, onSubmit, timer }) {
  const { coding } = question;
  const [language, setLanguage] = useState(draftCode?.language || coding.default_language || "python");
  const [codeByLang, setCodeByLang] = useState(() => ({
    ...coding.starter_code,
    ...(draftCode ? { [draftCode.language]: draftCode.code } : {}),
  }));
  const [explanation, setExplanation] = useState("");
  const [runResult, setRunResult] = useState(null);
  const [runs, setRuns] = useState(0); // each run replays the console's entrance
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState(null);
  const lastDraft = useRef(draftCode ? `${draftCode.language}\n${draftCode.code}` : "");

  const code = codeByLang[language] ?? "";
  const selected = coding.languages.find((l) => l.key === language);

  useEffect(() => {
    const key = `${language}\n${code}`;
    if (!waiting || key === lastDraft.current) return undefined;
    const timer = setTimeout(() => {
      if (socketRef.current?.send({ type: "CODE_DRAFT", code, language })) lastDraft.current = key;
    }, DRAFT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [code, language, waiting, socketRef]);

  async function run() {
    setRunning(true);
    setRunError(null);
    try {
      setRunResult(await api.interviews.runCode(sessionId, { code, language }));
      setRuns((n) => n + 1);
    } catch (err) {
      setRunError(err.message);
    } finally {
      setRunning(false);
    }
  }

  function submit() {
    if (!code.trim() || !waiting) return;
    setRunError(null);
    onSubmit({ code, language, explanation: explanation.trim() });
  }

  const tooLong = code.length > MAX_CODE;
  const shown = submittedResult || runResult;
  const pending = submitting && !submittedResult ? "submit" : running ? "run" : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="lg:sticky lg:top-20 lg:max-h-[calc(100svh-6rem)] lg:self-start lg:overflow-y-auto lg:rounded-2xl">
        <ProblemPanel question={question} />
      </div>

      <div className="min-w-0 space-y-4">
        <div className="overflow-hidden rounded-2xl border border-border-strong shadow-[0_30px_80px_-40px_rgb(0_0_0/0.9)]" style={{ background: EDITOR_BACKGROUND }}>
          <div className="flex items-center gap-2 border-b border-border bg-surface/70 pr-2 pl-1">
            <span className="flex items-center gap-2 border-r border-border px-3 py-2.5 font-mono text-xs text-foreground shadow-[inset_0_2px_0_var(--primary)]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-primary" />
              {FILE_NAME[language] || "solution"}
            </span>
            <label htmlFor="coding-language" className="sr-only">Language</label>
            <select id="coding-language" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!waiting}
              className="ml-1 h-8 rounded-lg border border-border bg-background px-2 text-xs text-muted focus:border-primary focus:outline-none">
              {coding.languages.map((l) => (
                <option key={l.key} value={l.key}>{l.label}{l.graded ? "" : " (not graded yet)"}</option>
              ))}
            </select>
            <span className="ml-auto">{timer}</span>
          </div>

          <CodeEditor language={language} value={code} readOnly={!waiting} label={`Code editor, ${selected?.label || language}`}
            onChange={(value) => setCodeByLang((m) => ({ ...m, [language]: value }))} />

          <div className="flex items-center gap-3 border-t border-border bg-surface/70 px-3 py-1.5 font-mono text-[11px] text-subtle">
            <span>{selected?.label || language}</span>
            {selected && !selected.graded && <span className="text-warning">runs as written · not graded yet</span>}
            <span className={`ml-auto tabular-nums ${tooLong ? "text-danger" : ""}`}>{code.length.toLocaleString()} / {MAX_CODE.toLocaleString()}</span>
          </div>
        </div>
        {selected && !selected.graded && (
          <p className="text-xs text-muted">
            {selected.label} runs as written: only Python is checked against the tests so far. Print your own results to see them.
          </p>
        )}

        <div>
          <label htmlFor="explanation" className="text-sm font-medium">Your approach</label>
          <p className="text-xs text-muted">How it works, and its time and space complexity. Interviewers expect this; it&apos;s scored.</p>
          <textarea id="explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={MAX_EXPLANATION}
            disabled={!waiting} rows={3} placeholder="e.g. One pass with a hash map of seen values: O(n) time, O(n) space."
            className="mt-2 w-full rounded-xl border border-border-strong bg-background/60 p-3 text-sm placeholder:text-subtle transition-[border-color,box-shadow] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15 disabled:opacity-60" />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={run} loading={running}
            disabled={!waiting || !code.trim() || tooLong}>
            {!running && <PlayIcon className="size-4" />} Run examples
          </Button>
          <Button type="button" onClick={submit} loading={submitting} disabled={!waiting || !code.trim() || tooLong}>
            Submit solution
          </Button>
        </div>
        {runError && <Alert tone="error">{runError}</Alert>}

        <section aria-label="Output" className="rounded-2xl border border-border bg-surface">
          <p className="border-b border-border px-4 py-2 font-mono text-[11px] uppercase tracking-wider text-subtle">Console</p>
          <div className="p-4">
            <OutputPanel key={`${submittedResult ? "submit" : "run"}-${runs}`} result={shown} pending={pending}
              source={submittedResult ? "submit" : "run"} />
          </div>
        </section>
      </div>
    </div>
  );
}
