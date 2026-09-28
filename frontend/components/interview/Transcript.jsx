import EvaluationCard from "./EvaluationCard";

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
          {entry.role === "candidate" && (
            <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
              <p className="mb-1 text-xs font-medium opacity-80">You</p>
              <p className="whitespace-pre-wrap">{entry.content}</p>
            </div>
          )}
          {entry.role === "evaluation" && <EvaluationCard evaluation={entry.evaluation} />}
        </li>
      ))}
    </ol>
  );
}
