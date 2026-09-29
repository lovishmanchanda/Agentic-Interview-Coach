"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import Card from "@/components/ui/Card";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import { Input, Select } from "@/components/ui/Field";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";
import { CODING_LANGUAGES, CODING_QUESTION_COUNTS, INTERVIEW_MODES, INTERVIEW_TYPES, QUESTION_COUNTS, topicLabel } from "@/lib/interviewOptions";
import { DIFFICULTIES, EXPERIENCE_LEVELS, TARGET_ROLES } from "@/lib/profileOptions";

const MAX_FOCUS = 5;

/** ?focus=dsa,oops&role=ml_engineer&type=behavioral pre-fills a drill (the report's "Practise weak areas" link);
 *  a preparation plan's buttons also pass &company=Google&mode=serious. */
function focusFromUrl(params) {
  return [...new Set((params.get("focus") || "").split(",").map((t) => t.trim()).filter(Boolean))].slice(0, MAX_FOCUS);
}

/** Older profiles store the role's label ("Software Engineer") instead of its key; match either. */
function roleValue(role) {
  const match = TARGET_ROLES.find((r) => r.value === role || r.label.toLowerCase() === role.toLowerCase());
  return match ? match.value : role;
}

function ConfigureForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [form, setForm] = useState(null);
  const [topics, setTopics] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);

  // First load: the profile's defaults, plus any drill topics from the URL.
  useEffect(() => {
    api.interviews.options()
      .then((options) => {
        const type = params.get("type");
        setForm({
          ...options.defaults,
          ...(["technical", "behavioral", "coding"].includes(type) ? { interview_type: type } : {}),
          ...(["practice", "serious"].includes(params.get("mode")) ? { interview_mode: params.get("mode") } : {}),
          ...(type === "coding" ? { question_count: Math.min(options.defaults.question_count, 3) } : {}),
          role: roleValue(params.get("role") || options.defaults.role),
          company: (params.get("company") || options.defaults.company || "").slice(0, 100),
          focus_topics: focusFromUrl(params),
        });
        setTopics(options.topics);
        setUnavailable(options.unavailable);
      })
      .catch(setLoadError);
  }, [params]);

  // A different role or interview type has different topics (competencies for behavioral).
  const role = form?.role;
  const interviewType = form?.interview_type;
  useEffect(() => {
    if (!role) return undefined;
    let current = true;
    api.interviews.options({ role, interviewType }).then((options) => current && setTopics(options.topics)).catch(() => {});
    return () => {
      current = false;
    };
  }, [role, interviewType]);

  if (loadError) {
    return loadError.code === "profile_missing" ? (
      <Alert tone="info" title="Set up your profile first">
        Interviews are built around your target role and experience.{" "}
        <Link href="/profile/setup" className="font-medium underline">Create your profile</Link>
      </Alert>
    ) : (
      <Alert tone="error">{loadError.message}</Alert>
    );
  }
  if (!form) return <Spinner label="Loading your defaults…" />;

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }));
  // Topics mean different things per type (dsa vs ownership), so switching type clears the drill.
  // A coding interview has at most 3 problems.
  const setType = (value) => setForm((f) => ({
    ...f, interview_type: value, focus_topics: value === f.interview_type ? f.focus_topics : [],
    question_count: value === "coding" ? Math.min(f.question_count, 3) : f.question_count,
  }));
  const behavioral = form.interview_type === "behavioral";
  const codingType = form.interview_type === "coding";
  const reasonFor = (field, value) => unavailable.find((u) => u.field === field && u.value === value)?.reason;
  const withAvailability = (field, options) =>
    options.map((o) => ({ ...o, disabled: Boolean(reasonFor(field, o.value)), reason: reasonFor(field, o.value) }));
  // Keep a URL-provided topic visible even if this role doesn't list it, so it can be unticked.
  const topicOptions = [...new Set([...topics, ...form.focus_topics])].map((t) => ({
    value: t,
    label: topicLabel(t),
    disabled: !form.focus_topics.includes(t) && form.focus_topics.length >= MAX_FOCUS,
  }));
  const roleOptions = TARGET_ROLES.some((r) => r.value === form.role)
    ? TARGET_ROLES
    : [{ value: form.role, label: form.role }, ...TARGET_ROLES];

  async function start(event) {
    event.preventDefault();
    setStarting(true);
    setError(null);
    try {
      const session = await api.interviews.create({ ...form, company: form.company.trim() || null });
      router.push(`/interview/session/${session.session_id}`);
    } catch (err) {
      setError(err.message);
      setStarting(false);
    }
  }

  return (
    <form onSubmit={start} className="space-y-6">
      {error && <Alert tone="error">{error}</Alert>}

      <Card title="Interview">
        <div className="space-y-5">
          <ChoiceGroup legend="Type" name="interview_type" size="lg" value={form.interview_type}
            onChange={setType} options={withAvailability("interview_type", INTERVIEW_TYPES)} />
          <ChoiceGroup legend="Mode" name="interview_mode" size="lg" value={form.interview_mode}
            onChange={set("interview_mode")} options={INTERVIEW_MODES} />
          <ChoiceGroup legend={codingType ? "Number of problems" : "Number of questions"} name="question_count"
            value={form.question_count} onChange={set("question_count")}
            options={codingType ? CODING_QUESTION_COUNTS : QUESTION_COUNTS}
            hint={codingType ? "Each problem takes about 15–35 minutes." : undefined} />
          {codingType && (
            <ChoiceGroup legend="Starting language" name="coding_language" value={form.coding_language || "python"}
              onChange={set("coding_language")} options={CODING_LANGUAGES}
              hint="You can switch per problem. Python is checked against every test; the others run as written for now." />
          )}
        </div>
      </Card>

      <Card title="Pitch it at" description="Filled in from your profile. Changes apply to this interview only.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Role" options={roleOptions} value={form.role} onChange={(e) => set("role")(e.target.value)} />
          <Select label="Experience" options={EXPERIENCE_LEVELS} value={form.experience_level}
            onChange={(e) => set("experience_level")(e.target.value)} />
          <Select label="Difficulty" options={DIFFICULTIES} value={form.difficulty}
            onChange={(e) => set("difficulty")(e.target.value)} hint="Adaptive starts from your experience level." />
          <Input label="Company" maxLength={100} value={form.company} onChange={(e) => set("company")(e.target.value)}
            hint="Optional. Saved with the interview for company-specific prep later." />
        </div>
      </Card>

      <Card title={behavioral ? "Focus competencies" : "Focus topics"}
        description={behavioral
          ? "Optional. Pick competencies to practise, or leave empty for a mix."
          : "Optional. Pick topics to drill, or leave empty for a mix across your role."}>
        <ChoiceGroup legend={behavioral ? "Competencies" : "Topics"} name="focus_topics" multiple value={form.focus_topics} onChange={set("focus_topics")}
          options={topicOptions}
          hint={form.focus_topics.length ? `${form.focus_topics.length} of up to ${MAX_FOCUS} selected` : `Up to ${MAX_FOCUS}.`} />
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-sm text-muted">{codingType ? "Code runs in an isolated sandbox, separate from the app." : "Answers are typed. Voice is coming soon."}</p>
        <Button type="submit" loading={starting}>Start interview</Button>
      </div>
    </form>
  );
}

export default function InterviewConfigurePage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Start an interview</h1>
        <p className="mt-1 text-sm text-muted">Questions are picked for your role and level, on a new topic each time.</p>
      </div>
      <Suspense fallback={<Spinner label="Loading…" />}>
        <ConfigureForm />
      </Suspense>
    </div>
  );
}
