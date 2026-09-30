import { AgentLabel } from "@/components/brand/AgentStatus";
import Button from "@/components/ui/Button";
import { topicLabel } from "@/lib/interviewOptions";

import MentorAnswer from "./MentorAnswer";

/** A drill button under a reply: a practice interview pre-filled with the weakest topics. */
function DrillAction({ action }) {
  return (
    <Button href={action.href} variant="secondary" size="sm" className="mt-3">
      Start a weak-area drill · {action.topics.map(topicLabel).join(", ")}
    </Button>
  );
}

/** A plan's practice buttons: each opens the start page pre-filled for that week's mock interview. */
function PracticeActions({ actions }) {
  if (!actions.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {actions.map((a) => (
        <Button key={a.href} href={a.href} variant="secondary" size="sm">{a.label}</Button>
      ))}
    </div>
  );
}

export default function ChatBubble({ message }) {
  if (message.role === "user") {
    return (
      <li className={`ml-auto max-w-[85%] ${message.pending ? "opacity-70" : ""}`}>
        <div className="rounded-2xl rounded-tr-sm border border-border-strong bg-raised px-4 py-3 text-sm">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </li>
    );
  }
  return (
    <li className="max-w-[92%] sm:max-w-[85%]">
      <div className="rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm">
        <AgentLabel agent="mentor" />
        <MentorAnswer text={message.content} sources={message.sources || []} />
        {(message.actions || []).filter((a) => a.type === "drill").map((a) => <DrillAction key={a.href} action={a} />)}
        <PracticeActions actions={(message.actions || []).filter((a) => a.type === "practice")} />
      </div>
    </li>
  );
}
