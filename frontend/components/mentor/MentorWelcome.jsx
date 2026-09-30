import Button from "@/components/ui/Button";
import { topicLabel } from "@/lib/interviewOptions";

const CAN_DO = [
  "Explain where you lost marks, citing the exact interview",
  "Turn your weak areas into a study plan",
  "Track how you're improving across interviews",
  "Send you into a drill on your weakest topics",
];

function StarterChips({ starters, onPick }) {
  return (
    <div className="flex flex-wrap gap-2">
      {starters.map((s) => (
        <button key={s} type="button" onClick={() => onPick(s)}
          className="rounded-full border border-border bg-surface px-4 py-2 text-left text-sm hover:border-primary hover:text-primary">
          {s}
        </button>
      ))}
    </div>
  );
}

/** Starters built from the latest report, so the first question is one the Mentor can answer well. */
function startersFor(welcome) {
  const weak = welcome.latest?.weakest_topic && topicLabel(welcome.latest.weakest_topic);
  return [
    weak ? `Why did I lose marks on ${weak}?` : "How am I doing overall?",
    weak ? `Make me a one-week study plan for ${weak}` : "What should I practise next?",
    welcome.report_count >= 2 ? "How have I progressed across my interviews?" : "What went well in my last interview?",
    "Drill me on my weak spots",
  ];
}

/**
 * What a new conversation opens with. No reports yet: what the Mentor does and a first-interview CTA.
 * Otherwise a greeting from the latest report (built here from real scores, no LLM call) and starters.
 */
export default function MentorWelcome({ welcome, name, onPick, onPrepare }) {
  if (!welcome.report_count) {
    return (
      <section className="rounded-xl border border-border bg-surface p-6">
        <h2 className="text-lg font-semibold">ARIA learns from your interviews</h2>
        <p className="mt-1 text-sm text-muted">
          Once you finish an interview, its report comes here. Then ARIA can:
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {CAN_DO.map((item) => <li key={item}>{item}</li>)}
        </ul>
        <div className="mt-5 flex flex-wrap gap-2">
          <Button href="/interview/configure">Start your first interview</Button>
          <Button variant="secondary" onClick={onPrepare}>Prepare for a company</Button>
        </div>
      </section>
    );
  }

  const { latest } = welcome;
  const date = new Date(latest.generated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const kind = latest.interview_type === "behavioral" ? "behavioral" : "technical";
  return (
    <section className="space-y-4">
      <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm leading-relaxed sm:max-w-[85%]">
        <p>
          {name ? `Welcome back, ${name}. ` : "Welcome back. "}
          Your last interview ({kind}, {date}) scored <strong className="font-semibold">{latest.overall}/10</strong>
          {latest.strongest_topic && <>, strongest in {topicLabel(latest.strongest_topic)}</>}
          {latest.weakest_topic
            ? <>{latest.strongest_topic ? ", and " : ". "}{topicLabel(latest.weakest_topic)} is the one to work on.</>
            : "."}
        </p>
        <p className="mt-2">
          {welcome.report_count === 1 ? "I've read that report" : `I've read all ${welcome.report_count} of your reports`}. What would you like to dig into?
        </p>
      </div>
      <StarterChips starters={startersFor(welcome)} onPick={onPick} />
      <Button variant="secondary" size="sm" onClick={onPrepare}>Prepare for a company interview</Button>
    </section>
  );
}
