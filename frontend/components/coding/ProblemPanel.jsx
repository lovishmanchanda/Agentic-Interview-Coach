import ReactMarkdown from "react-markdown";

import { AgentLabel } from "@/components/brand/AgentStatus";
import Badge from "@/components/ui/Badge";
import { ClockIcon } from "@/components/ui/icons";
import { topicLabel } from "@/lib/interviewOptions";

const DIFFICULTY_TONE = { easy: "success", medium: "neutral", hard: "warning" };

/** The problem statement, examples and constraints. The statement is VERA's words (markdown). */
export default function ProblemPanel({ question }) {
  const { coding } = question;
  return (
    <section aria-label="Problem" className="overflow-hidden rounded-2xl border border-border bg-surface text-sm">
      <header className="border-b border-border px-5 pt-4 pb-3">
        <AgentLabel agent="interviewer" detail="Problem" />
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge tone="steel" dot={false}>{topicLabel(question.topic)}</Badge>
          <Badge tone={DIFFICULTY_TONE[question.difficulty] || "neutral"}><span className="capitalize">{question.difficulty}</span></Badge>
          <span className="ml-auto flex items-center gap-1 text-muted"><ClockIcon className="size-3.5" /> about {coding.time_limit_minutes} min</span>
        </div>
      </header>

      <div className="space-y-5 p-5">
        <div className="space-y-3 leading-relaxed [&_code]:rounded [&_code]:bg-background [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-xs [&_code]:text-foreground [&_li]:mt-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-background [&_pre]:p-3 [&_strong]:text-foreground [&_ul]:list-disc [&_ul]:pl-5">
          <ReactMarkdown>{question.text}</ReactMarkdown>
        </div>
        <p className="rounded-lg border border-border bg-background/60 px-3 py-2 text-xs text-muted">
          Implement <code className="font-mono text-primary">{coding.entry_function}()</code>. It&apos;s called with each test&apos;s arguments and its return value is checked.
        </p>

        {coding.examples?.length > 0 && (
          <div className="space-y-2">
            <h3 className="font-mono text-[11px] uppercase tracking-wider text-subtle">Examples</h3>
            {coding.examples.map((ex, i) => (
              <div key={i} className="rounded-xl border border-border bg-background/60 p-3 font-mono text-xs">
                <p className="mb-1.5 text-[10px] uppercase tracking-wider text-subtle">Example {i + 1}</p>
                <p><span className="text-muted">Input  </span>{ex.input}</p>
                <p><span className="text-muted">Output </span>{ex.output}</p>
                {ex.explanation && <p className="mt-1.5 font-sans leading-relaxed text-muted">{ex.explanation}</p>}
              </div>
            ))}
          </div>
        )}

        {coding.constraints && (
          <div>
            <h3 className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-subtle">Constraints</h3>
            <ul className="space-y-1 text-xs">
              {coding.constraints.split("|").map((c) => (
                <li key={c} className="flex gap-2"><span aria-hidden="true" className="text-subtle">—</span><code className="font-mono">{c.trim()}</code></li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <footer className="border-t border-border px-5 py-3 text-xs text-muted">
        {coding.visible_tests.length} example test{coding.visible_tests.length === 1 ? "" : "s"}
        {coding.hidden_test_count ? ` + ${coding.hidden_test_count} hidden` : ""}
      </footer>
    </section>
  );
}
