import EvaluationCard from "./EvaluationCard";

/** Renders snapshot/report transcript entries: interviewer · candidate · evaluation. */
export default function Transcript({ entries }) {
  return (
    <ol className="space-y-4">
      {entries.map((entry, index) => (
        <li key={`${entry.role}-${entry.question_id}-${index}`}>
          {entry.role === "interviewer" && (
            <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm">
              <p className="mb-1 text-xs font-medium text-primary">Interviewer</p>
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
