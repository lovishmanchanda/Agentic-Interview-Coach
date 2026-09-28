"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { topicLabel } from "@/lib/interviewOptions";
import { EXPERIENCE_LEVELS, TARGET_ROLES, labelFor } from "@/lib/profileOptions";
import { useProfileStore } from "@/store/profileStore";

const STATE_LABEL = {
  REPORT_READY: { text: "Report ready", tone: "success" },
  WAITING_FOR_RESPONSE: { text: "In progress", tone: "primary" },
  EVALUATING: { text: "In progress", tone: "primary" },
  SETUP: { text: "Not started", tone: "neutral" },
};
const IN_PROGRESS = { text: "In progress", tone: "primary" };

function InterviewHistory() {
  const [sessions, setSessions] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.interviews.list().then(setSessions).catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-danger">{error}</p>;
  if (!sessions) return <Spinner label="Loading…" />;
  if (!sessions.length) {
    return (
      <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
        <p className="font-medium">No interviews yet</p>
        <p className="mt-1 text-sm text-muted">Start your first interview. Its report will show up here.</p>
      </div>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {sessions.map((s) => {
        const label = STATE_LABEL[s.state] || IN_PROGRESS;
        const href = s.report_id ? `/interview/report/${s.report_id}` : `/interview/session/${s.session_id}`;
        return (
          <li key={s.session_id}>
            <Link href={href} className="flex items-center justify-between gap-4 py-3 hover:text-primary">
              <span className="text-sm">
                <span className="font-medium capitalize">{s.config.interview_type}</span>
                <span className="text-muted">
                  {s.config.interview_mode === "serious" ? " (serious)" : ""}
                  {s.focus_topics?.length > 0 ? " drill" : ""} · {new Date(s.started_at).toLocaleString()}
                </span>
                {s.topics_covered.length > 0 && <span className="text-muted"> · {s.topics_covered.map(topicLabel).join(", ")}</span>}
              </span>
              <Badge tone={label.tone}>{label.text}</Badge>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export default function DashboardPage() {
  const profile = useProfileStore((s) => s.profile);
  if (!profile) return null; // AuthGuard guarantees a profile before rendering

  const firstName = profile.personal.name.split(" ")[0];
  const role = labelFor(TARGET_ROLES, profile.target.role);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold">Hi {firstName} 👋</h1>
        <p className="mt-1 text-muted">
          Preparing for <span className="font-medium text-foreground">{role}</span>
          {profile.target.company ? ` at ${profile.target.company}` : ""}.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card title="Start an interview" description="A technical question with instant, structured feedback and a report.">
          <Button href="/interview/configure">Start interview</Button>
        </Card>
        <Card title="Talk to your mentor" description="Ask about your strengths, gaps and what to practise next, grounded in your reports.">
          <Button href="/mentor" variant="secondary">Open mentor</Button>
        </Card>
      </div>

      <Card title="Interview history">
        <InterviewHistory />
      </Card>

      <Card title="Your profile" action={<Button href="/profile" variant="ghost" size="sm">Edit</Button>}>
        <dl className="grid gap-4 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-muted">Experience</dt>
            <dd className="mt-1 font-medium">{labelFor(EXPERIENCE_LEVELS, profile.personal.experience_level)}</dd>
          </div>
          <div>
            <dt className="text-muted">Difficulty</dt>
            <dd className="mt-1 font-medium capitalize">{profile.preferences.preferred_difficulty}</dd>
          </div>
          <div>
            <dt className="text-muted">Skills</dt>
            <dd className="mt-1 flex flex-wrap gap-1.5">
              {profile.skills.length ? profile.skills.map((s) => <Badge key={s} tone="primary">{s}</Badge>) : <span className="text-muted">None added</span>}
            </dd>
          </div>
        </dl>
      </Card>
    </div>
  );
}
