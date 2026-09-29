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

export default function ChatBubble({ message }) {
  if (message.role === "user") {
    return (
      <li className={`ml-auto max-w-[85%] ${message.pending ? "opacity-70" : ""}`}>
        <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-3 text-sm text-primary-foreground">
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        </div>
      </li>
    );
  }
  return (
    <li className="max-w-[92%] sm:max-w-[85%]">
      <div className="rounded-2xl rounded-tl-sm border border-border bg-surface px-4 py-3 text-sm">
        <MentorAnswer text={message.content} sources={message.sources || []} />
        {(message.actions || []).filter((a) => a.type === "drill").map((a) => <DrillAction key={a.href} action={a} />)}
      </div>
    </li>
  );
}
