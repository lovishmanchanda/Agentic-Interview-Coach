/**
 * The transcript as plain, fully open text, for paper and PDF only (the screen shows the folding rounds).
 * Each round: VERA's question, your answer, and her score and notes.
 */
export default function PrintTranscript({ rounds }) {
  return (
    <ol className="hidden space-y-5 text-sm print:block">
      {rounds.map((round) => {
        const answers = round.entries.filter((e) => e.role === "candidate");
        const evaluation = round.evaluation;
        return (
          <li key={round.key} className="space-y-1.5">
            <p className="font-semibold">
              {round.question.is_follow_up ? `Follow-up to question ${round.number}` : `Question ${round.number}`}: {round.question.content}
            </p>
            {answers.map((a, i) => (
              <div key={i} className="border-l-2 border-border pl-3">
                {a.code && <pre className="whitespace-pre-wrap font-mono text-xs">{a.code}</pre>}
                {a.content && <p className="whitespace-pre-wrap">{a.content}</p>}
              </div>
            ))}
            {evaluation && (
              <p className="text-muted">
                <span className="font-medium text-foreground">VERA: {evaluation.overall_score}/10 ({evaluation.performance_tier}).</span> {evaluation.feedback}
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
