import Badge from "@/components/ui/Badge";
import { dimensionLabel } from "@/lib/interviewOptions";

const TIER_TONE = { strong: "success", adequate: "neutral", weak: "warning" }; // orange stays for actions

function List({ title, items, tone }) {
  if (!items?.length) return null;
  return (
    <div>
      <p className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</p>
      <ul className="mt-1.5 space-y-1 text-sm">
        {items.map((item) => (
          <li key={item} className="flex gap-2">
            <span aria-hidden="true" className="text-muted">•</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function EvaluationCard({ evaluation }) {
  const { overall_score, performance_tier, dimensions, strengths, weaknesses, feedback, suggestion, model_answer_outline } = evaluation;
  return (
    <div className="space-y-4 rounded-xl border border-border bg-surface-muted p-5">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-2xl font-semibold">{overall_score}</span>
        <span className="text-sm text-muted">/ 10</span>
        <Badge tone={TIER_TONE[performance_tier] || "neutral"}>{performance_tier}</Badge>
        {dimensions && (
          <span className="text-xs text-muted">
            {/* technical: correctness · depth · communication; behavioral: the STAR parts, specificity, ownership… */}
            {Object.entries(dimensions).map(([name, score]) => `${dimensionLabel(name)} ${score}`).join(" · ")}
          </span>
        )}
      </div>
      {feedback && <p className="text-sm">{feedback}</p>}
      <div className="grid gap-4 sm:grid-cols-2">
        <List title="Strengths" items={strengths} tone="text-success" />
        <List title="To improve" items={weaknesses} tone="text-warning" />
      </div>
      {suggestion && (
        <p className="text-sm">
          <span className="font-medium">Next step: </span>
          {suggestion}
        </p>
      )}
      <List title="A strong answer would cover" items={model_answer_outline} tone="text-primary" />
    </div>
  );
}
