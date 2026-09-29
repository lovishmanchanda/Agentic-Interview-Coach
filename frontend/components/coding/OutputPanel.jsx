import { EXECUTION_STATUS } from "@/lib/interviewOptions";

const TONE = {
  success: "bg-success-soft text-success",
  danger: "bg-danger/10 text-danger",
  warning: "bg-warning-soft text-warning",
};

function Pre({ label, text, tone = "" }) {
  if (!text) return null;
  return (
    <div>
      <p className="mb-1 text-xs font-medium text-muted">{label}</p>
      <pre className={`max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-background p-3 font-mono text-xs ${tone}`}>{text}</pre>
    </div>
  );
}

/**
 * A run's result: status, tests passed, and each test. A hidden test in serious mode arrives with no input or
 * output (the server strips them), so it shows as pass/fail only. `source` says whether this was a Run (the
 * visible examples) or the submission (every test).
 */
export default function OutputPanel({ result, source }) {
  if (!result) {
    return <p className="text-sm text-muted">Run your code to check it against the examples. Submit runs every test, hidden ones too.</p>;
  }
  const status = EXECUTION_STATUS[result.status] || { label: result.status, tone: "warning" };
  return (
    <div className="space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[status.tone]}`}>{status.label}</span>
        {result.graded ? (
          <span className="font-medium tabular-nums">{result.passed_tests}/{result.total_tests} tests passed</span>
        ) : (
          <span className="text-muted">Ran as written; this language isn&apos;t graded against tests yet.</span>
        )}
        {result.runtime_ms != null && <span className="text-xs text-muted tabular-nums">{result.runtime_ms} ms</span>}
        <span className="ml-auto text-xs text-muted">
          {source === "submit" ? (result.graded ? "Submitted: every test" : "Submitted") : (result.graded ? "Run: examples only" : "Run")}
        </span>
      </div>

      {result.graded && result.test_results?.length > 0 && (
        <ul className="divide-y divide-border rounded-lg border border-border text-xs">
          {result.test_results.map((t, i) => (
            <li key={i} className="flex gap-2 px-3 py-2">
              <span aria-hidden className={t.passed ? "text-success" : "text-danger"}>{t.passed ? "✓" : "✗"}</span>
              <span className="sr-only">{t.passed ? "Passed" : "Failed"}</span>
              {t.input == null ? (
                <span className="text-muted">Hidden test {t.passed ? "passed" : "failed"}</span>
              ) : (
                <span className="min-w-0 flex-1 space-y-0.5 font-mono">
                  <span className="block truncate" title={t.input}><span className="text-muted">in </span>{t.input}{t.is_hidden && <span className="text-muted"> · hidden</span>}</span>
                  <span className="block truncate"><span className="text-muted">expected </span>{t.expected}</span>
                  {!t.passed && <span className="block truncate text-danger"><span className="text-muted">got </span>{t.actual}</span>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <Pre label="Compiler" text={result.compile_output} tone="text-danger" />
      <Pre label="Errors" text={result.stderr} tone="text-danger" />
      <Pre label="Your output (print)" text={result.stdout} />
    </div>
  );
}
