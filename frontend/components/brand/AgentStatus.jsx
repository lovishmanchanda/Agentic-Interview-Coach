import { AGENTS } from "./AgentAvatar";

/** "VERA · Evaluating your answer…" with her avatar in its thinking state. Replaces a bare spinner. */
export default function AgentStatus({ agent, text }) {
  const { name, Avatar } = AGENTS[agent];
  return (
    <span role="status" className="inline-flex items-center gap-2.5 text-sm text-muted">
      <Avatar active size="size-7" />
      <span>
        <span className="font-medium text-foreground">{name}</span> · {text}
      </span>
    </span>
  );
}

/** The small name line above an agent's message. */
export function AgentLabel({ agent, detail }) {
  const { name, Avatar } = AGENTS[agent];
  return (
    <span className="mb-2 flex items-center gap-2 text-xs">
      <Avatar size="size-6" />
      <span className={`font-semibold tracking-wide ${agent === "interviewer" ? "text-steel" : "text-primary"}`}>{name}</span>
      {detail && <span className="text-muted">· {detail}</span>}
    </span>
  );
}
