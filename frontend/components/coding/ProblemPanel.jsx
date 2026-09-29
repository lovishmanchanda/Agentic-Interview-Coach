import ReactMarkdown from "react-markdown";

import { topicLabel } from "@/lib/interviewOptions";

/** The problem statement, examples and constraints. The statement is the interviewer's words (markdown). */
export default function ProblemPanel({ question }) {
  const { coding } = question;
  return (
    <section aria-label="Problem" className="space-y-4 rounded-xl border border-border bg-surface p-5 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="rounded-full bg-surface-muted px-2 py-0.5 font-medium">{topicLabel(question.topic)}</span>
        <span className="capitalize">{question.difficulty}</span>
        <span>· about {coding.time_limit_minutes} min</span>
      </div>
      <div className="space-y-2 leading-relaxed [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:font-mono [&_code]:text-xs">
        <ReactMarkdown>{question.text}</ReactMarkdown>
      </div>
      <p className="text-xs text-muted">
        Implement <code className="rounded bg-background px-1 font-mono">{coding.entry_function}()</code>. It&apos;s called with each test&apos;s arguments and its return value is checked.
      </p>
      {coding.examples?.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Examples</h3>
          {coding.examples.map((ex, i) => (
            <div key={i} className="rounded-lg bg-background p-3 font-mono text-xs">
              <p><span className="text-muted">Input: </span>{ex.input}</p>
              <p><span className="text-muted">Output: </span>{ex.output}</p>
              {ex.explanation && <p className="mt-1 font-sans text-muted">{ex.explanation}</p>}
            </div>
          ))}
        </div>
      )}
      {coding.constraints && (
        <div>
          <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Constraints</h3>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {coding.constraints.split("|").map((c) => <li key={c}>{c.trim()}</li>)}
          </ul>
        </div>
      )}
      <p className="text-xs text-muted">
        {coding.visible_tests.length} example test{coding.visible_tests.length === 1 ? "" : "s"}
        {coding.hidden_test_count ? ` + ${coding.hidden_test_count} hidden` : ""}.
      </p>
    </section>
  );
}
