import { EXECUTION_STATUS } from "@/lib/interviewOptions";

import EvaluationCard from "./EvaluationCard";

/** A coding answer: the code, the explanation, and what happened when the server ran it. */
function CodeSubmission({ entry }) {
  const run = entry.execution;
  const status = run && (EXECUTION_STATUS[run.status]?.label || run.status);
  const failedVisible = (run?.test_results || []).filter((t) => !t.passed && t.input != null).slice(0, 3);
  return (
    <div className="ml-auto max-w-[92%] space-y-2 rounded-2xl rounded-tr-sm border border-primary/30 bg-surface px-4 py-3 text-sm">
      <p className="text-xs font-medium text-primary">
        You · {entry.language} solution
        {run && <span className="text-muted"> · {status}{run.graded ? ` · ${run.passed_tests}/${run.total_tests} tests` : " · not graded"}</span>}
        {!run && <span className="text-muted"> · running…</span>}
      </p>
      <pre className="max-h-72 overflow-auto rounded-lg bg-background p-3 font-mono text-xs">{entry.code}</pre>
      {entry.content && <p className="whitespace-pre-wrap text-muted"><span className="font-medium text-foreground">Approach: </span>{entry.content}</p>}
      {failedVisible.length > 0 && (
        <ul className="space-y-0.5 font-mono text-xs text-danger">
          {failedVisible.map((t, i) => <li key={i}>✗ {t.input} → expected {t.expected}, got {t.actual}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Renders snapshot/report transcript entries: interviewer · hint · candidate · evaluation. */
export default function Transcript({ entries }) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => (
        <li key={`${entry.role}-${entry.question_id}-${index}`}>
          {entry.role === "interviewer" && (
            <div className={`max-w-[85%] rounded-2xl rounded-tl-sm border bg-surface px-4 py-3 text-sm ${
              entry.is_follow_up ? "ml-4 border-primary/40" : "border-border"}`}>
              <p className="mb-1 text-xs font-medium text-primary">Interviewer{entry.is_follow_up ? " · follow-up" : ""}</p>
              <p className="whitespace-pre-wrap">{entry.content}</p>
            </div>
          )}
          {entry.role === "hint" && (
            <div className="ml-4 max-w-[85%] rounded-xl border border-dashed border-warning/50 bg-warning-soft px-4 py-2 text-sm">
              <p className="mb-0.5 text-xs font-medium text-warning">Hint</p>
              <p className="whitespace-pre-wrap">{entry.content}</p>
            </div>
          )}
          {entry.role === "candidate" && !entry.code && (
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
              <p className="mb-1 text-xs font-medium opacity-80">You</p>
              <p className="whitespace-pre-wrap">{entry.content}</p>
            </div>
          )}
          {entry.role === "candidate" && entry.code && <CodeSubmission entry={entry} />}
          {entry.role === "evaluation" && <EvaluationCard evaluation={entry.evaluation} />}
        </li>
      ))}
    </ol>
  );
}
