"use client";

import { useEffect, useRef, useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

import CodeEditor from "./CodeEditor";
import OutputPanel from "./OutputPanel";
import ProblemPanel from "./ProblemPanel";

const DRAFT_DEBOUNCE_MS = 5000; // the editor's content is autosaved; code is only *run* on Run or Submit
const MAX_CODE = 10000;
const MAX_EXPLANATION = 2000;

/**
 * One coding problem: statement, editor (one buffer per language, so switching doesn't lose work), Run (the
 * visible examples, over REST, not recorded) and Submit (every test, over the socket; the server runs it and
 * sends CODE_RESULT). Rendered with key={question_id}, so a new problem starts fresh.
 */
export default function CodingRoom({ sessionId, question, draftCode, waiting, submitting, submittedResult, socketRef, onSubmit }) {
  const { coding } = question;
  const [language, setLanguage] = useState(draftCode?.language || coding.default_language || "python");
  const [codeByLang, setCodeByLang] = useState(() => ({
    ...coding.starter_code,
    ...(draftCode ? { [draftCode.language]: draftCode.code } : {}),
  }));
  const [explanation, setExplanation] = useState("");
  const [runResult, setRunResult] = useState(null);
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

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="lg:sticky lg:top-4 lg:self-start">
        <ProblemPanel question={question} />
      </div>

      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm">
            <label htmlFor="coding-language" className="text-muted">Language</label>
            <select id="coding-language" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!waiting}
              className="h-9 rounded-lg border border-border bg-surface px-2 text-sm focus:border-primary focus:outline-none">
              {coding.languages.map((l) => (
                <option key={l.key} value={l.key}>{l.label}{l.graded ? "" : " (not graded yet)"}</option>
              ))}
            </select>
          </div>
          <span className={`text-xs tabular-nums ${tooLong ? "text-danger" : "text-muted"}`}>{code.length}/{MAX_CODE}</span>
        </div>
        {selected && !selected.graded && (
          <p className="text-xs text-muted">
            {selected.label} runs as written: only Python is checked against the tests so far. Print your own results to see them.
          </p>
        )}

        <CodeEditor language={language} value={code} readOnly={!waiting} label={`Code editor, ${selected?.label || language}`}
          onChange={(value) => setCodeByLang((m) => ({ ...m, [language]: value }))} />

        <div>
          <label htmlFor="explanation" className="text-sm font-medium">Your approach</label>
          <p className="text-xs text-muted">How it works, and its time and space complexity. Interviewers expect this; it&apos;s scored.</p>
          <textarea id="explanation" value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={MAX_EXPLANATION}
            disabled={!waiting} rows={3} placeholder="e.g. One pass with a hash map of seen values: O(n) time, O(n) space."
            className="mt-1.5 w-full rounded-xl border border-border bg-surface p-3 text-sm focus:border-primary focus:outline-none disabled:opacity-60" />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" variant="secondary" onClick={run} loading={running}
            disabled={!waiting || !code.trim() || tooLong}>Run examples</Button>
          <Button type="button" onClick={submit} loading={submitting} disabled={!waiting || !code.trim() || tooLong}>
            Submit solution
          </Button>
        </div>
        {runError && <Alert tone="error">{runError}</Alert>}

        <section aria-label="Output" className="rounded-xl border border-border bg-surface p-4">
          <OutputPanel result={shown} source={submittedResult ? "submit" : "run"} />
        </section>
      </div>
    </div>
  );
}
