"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useId, useState } from "react";

import InterviewBrief from "@/components/interview/configure/InterviewBrief";
import PresetPicker from "@/components/interview/configure/PresetPicker";
import SplitHeading from "@/components/motion/SplitHeading";
import Alert from "@/components/ui/Alert";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import { Input, Select } from "@/components/ui/Field";
import { ChevronDownIcon, SlidersIcon } from "@/components/ui/icons";
import Skeleton from "@/components/ui/Skeleton";
import { api } from "@/lib/api";
import { CODING_LANGUAGES, CODING_QUESTION_COUNTS, INTERVIEW_MODES, INTERVIEW_TYPES, QUESTION_COUNTS, topicLabel } from "@/lib/interviewOptions";
import { BASE_PRESETS, drillPreset, matchPreset } from "@/lib/interviewPresets";
import { DIFFICULTIES, EXPERIENCE_LEVELS, TARGET_ROLES } from "@/lib/profileOptions";
import { useShellStore } from "@/store/shellStore";

const MAX_FOCUS = 5;
const URL_CHOICES = ["focus", "type", "mode", "company", "role"];

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

function Section({ title, description, children }) {
  return (
    <section className="space-y-4 p-5 sm:p-6">
      <header>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
      </header>
      {children}
    </section>
  );
}

function Loading() {
  return (
    <div role="status" aria-label="Loading your defaults" className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-36 rounded-2xl" />)}</div>
      <Skeleton className="h-96 rounded-3xl" />
    </div>
  );
}

function ConfigureForm() {
  const router = useRouter();
  const params = useSearchParams();
  const panelId = useId();
  const weakestTopic = useShellStore((s) => s.weakestTopic);
  const weakestType = useShellStore((s) => s.weakestType);
  const [form, setForm] = useState(null);
  const [topics, setTopics] = useState([]);
  const [unavailable, setUnavailable] = useState([]);
  const [loadError, setLoadError] = useState(null);
  const [error, setError] = useState(null);
  const [starting, setStarting] = useState(false);
  // A link that pre-fills choices (a drill, a prep plan) opens the options so you can see what was set.
  const [customise, setCustomise] = useState(() => URL_CHOICES.some((k) => params.has(k)));

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
  if (!form) return <Loading />;

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

  const presets = [...(weakestTopic ? [drillPreset(weakestTopic, weakestType)] : []), ...BASE_PRESETS];
  const presetId = matchPreset(form, presets);
  const presetTitle = presets.find((p) => p.id === presetId)?.title;

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
    // Phones: presets, then VERA's brief with Start, then Customise. Wide screens: the brief sits beside both.
    <form onSubmit={start} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start xl:gap-x-6">
      <div className="min-w-0 xl:col-start-1">
        <PresetPicker presets={presets} value={presetId} reasonFor={(p) => reasonFor("interview_type", p.patch.interview_type)}
          onChange={(p) => setForm((f) => ({ ...f, ...p.patch }))} />
      </div>

      <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1 xl:self-stretch">
        <InterviewBrief form={form} presetTitle={presetTitle} starting={starting} error={error} />
      </div>

      <div className="min-w-0 space-y-4 xl:col-start-1">
        <button type="button" onClick={() => setCustomise((c) => !c)} aria-expanded={customise} aria-controls={panelId}
          className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-border-strong px-4 py-3.5 text-left text-sm transition-colors hover:border-subtle hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <SlidersIcon className="size-5 shrink-0 text-muted" />
          <span className="flex-1">
            <span className="font-medium">Customise</span>
            <span className="text-muted max-sm:hidden"> · type, mode, length, role, difficulty, topics</span>
          </span>
          <ChevronDownIcon className={`size-4 text-muted transition-transform duration-300 ${customise ? "rotate-180" : ""}`} />
        </button>

        <AnimatePresence initial={false}>
          {customise && (
            <motion.div id={panelId} key="customise" initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }} className="overflow-hidden">
              <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
                <Section title="Interview">
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
                </Section>

                <Section title="Pitch it at" description="Filled in from your profile. Changes apply to this interview only.">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Select label="Role" options={roleOptions} value={form.role} onChange={(e) => set("role")(e.target.value)} />
                    <Select label="Experience" options={EXPERIENCE_LEVELS} value={form.experience_level}
                      onChange={(e) => set("experience_level")(e.target.value)} />
                    <Select label="Difficulty" options={DIFFICULTIES} value={form.difficulty}
                      onChange={(e) => set("difficulty")(e.target.value)} hint="Adaptive starts from your experience level." />
                    <Input label="Company" maxLength={100} value={form.company} onChange={(e) => set("company")(e.target.value)}
                      hint="Optional. Saved with the interview for company-specific prep later." />
                  </div>
                </Section>

                <Section title={behavioral ? "Focus competencies" : "Focus topics"}
                  description={behavioral
                    ? "Optional. Pick competencies to practise, or leave empty for a mix."
                    : "Optional. Pick topics to drill, or leave empty for a mix across your role."}>
                  <ChoiceGroup legend={behavioral ? "Competencies" : "Topics"} name="focus_topics" multiple value={form.focus_topics}
                    onChange={set("focus_topics")} options={topicOptions}
                    hint={form.focus_topics.length ? `${form.focus_topics.length} of up to ${MAX_FOCUS} selected` : `Up to ${MAX_FOCUS}.`} />
                </Section>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </form>
  );
}

/** Start an interview (Phase 7.8): pick a starting point, adjust it if you like, and VERA says what's coming. */
export default function InterviewConfigurePage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="eyebrow">New interview</p>
        <SplitHeading as="h1" text="Take the *seat.*" animateOnMount className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl" />
        <p className="mt-3 max-w-xl text-sm text-muted sm:text-base">
          Pick a starting point. Questions are chosen for your role and level, on a new topic each time.
        </p>
      </header>
      <Suspense fallback={<Loading />}>
        <ConfigureForm />
      </Suspense>
    </div>
  );
}
