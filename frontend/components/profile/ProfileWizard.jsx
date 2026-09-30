"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import { Input, Select, Textarea } from "@/components/ui/Field";
import { fieldErrors } from "@/lib/api";
import { DIFFICULTIES, EXPERIENCE_LEVELS, IO_MODES, SKILL_SUGGESTIONS, TARGET_ROLES } from "@/lib/profileOptions";
import { useAuthStore } from "@/store/authStore";
import { useProfileStore } from "@/store/profileStore";
import { toast } from "@/store/toastStore";

import SkillsInput from "./SkillsInput";

const STEPS = [
  { key: "personal", title: "About you", description: "Helps VERA, your interviewer, pitch questions at the right level." },
  { key: "target", title: "Target role", description: "Questions and feedback focus on this role." },
  { key: "skills", title: "Skills", description: "What you know or want to be tested on." },
  { key: "preferences", title: "Preferences", description: "How you want to practise. You can change this any time." },
];

function initialForm(profile, userName) {
  return {
    personal: { name: profile?.personal.name ?? userName ?? "", education: profile?.personal.education ?? "", experience_level: profile?.personal.experience_level ?? "fresher" },
    target: { role: profile?.target.role ?? "software_engineer", company: profile?.target.company ?? "", job_description: profile?.target.job_description ?? "" },
    skills: profile?.skills ?? [],
    preferences: { input_mode: "text", output_mode: "text", preferred_difficulty: "adaptive", ...profile?.preferences },
  };
}

function toPayload(form) {
  return {
    personal: { ...form.personal, name: form.personal.name.trim(), education: form.personal.education.trim() },
    target: {
      role: form.target.role,
      company: form.target.company.trim() || null,
      job_description: form.target.job_description.trim() || null,
    },
    skills: form.skills,
    preferences: form.preferences,
  };
}

// Voice isn't built yet (Phase 5): shown, but not selectable.
const IO_CHOICES = IO_MODES.map((m) => (m.value === "voice" ? { ...m, label: "Voice", disabled: true, reason: "Coming soon" } : m));
const EASE = [0.16, 1, 0.3, 1];

function validateStep(key, form) {
  const errors = {};
  if (key === "personal" && !form.personal.name.trim()) errors["personal.name"] = "Enter your name";
  if (key === "target" && !form.target.role) errors["target.role"] = "Choose a role";
  return errors;
}

/** mode="create": guided steps, first-time setup. mode="edit": tabbed, save any time. */
export default function ProfileWizard({ mode = "create" }) {
  const router = useRouter();
  const userName = useAuthStore((s) => s.user?.name);
  const { profile, save } = useProfileStore();
  const [form, setForm] = useState(() => initialForm(profile, userName));
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState(1); // which way the steps slide
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState({ saving: false, error: null, saved: false });

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const set = (section, key) => (event) =>
    setForm((f) => ({ ...f, [section]: { ...f[section], [key]: event.target.value } }));

  function goTo(index) {
    if (mode === "create" && index > stepIndex) {
      const stepErrors = validateStep(step.key, form);
      setErrors(stepErrors);
      if (Object.keys(stepErrors).length) return;
    }
    setErrors({});
    setDirection(index > stepIndex ? 1 : -1);
    setStepIndex(index);
  }

  async function submit() {
    const allErrors = STEPS.reduce((acc, s) => ({ ...acc, ...validateStep(s.key, form) }), {});
    setErrors(allErrors);
    if (Object.keys(allErrors).length) {
      setStepIndex(STEPS.findIndex((s) => Object.keys(allErrors).some((k) => k.startsWith(s.key))));
      return;
    }
    setStatus({ saving: true, error: null, saved: false });
    try {
      await save(toPayload(form));
      if (mode === "create") {
        toast.success("VERA is ready when you are. Take your first interview from your desk.", { title: "You're all set" });
        router.replace("/dashboard");
        return;
      }
      setStatus({ saving: false, error: null, saved: true });
    } catch (error) {
      setErrors(fieldErrors(error));
      setStatus({ saving: false, error: error.message, saved: false });
    }
  }

  return (
    <div className="space-y-6">
      <nav aria-label="Profile sections">
        <ol className="grid grid-cols-4 gap-2 sm:gap-3">
          {STEPS.map((s, index) => {
            const done = index < stepIndex;
            const current = index === stepIndex;
            return (
              <li key={s.key}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  disabled={mode === "create" && index > stepIndex + 1}
                  aria-current={current ? "step" : undefined}
                  className="group w-full text-left disabled:cursor-not-allowed"
                >
                  <span className="relative block h-1 overflow-hidden rounded-full bg-border">
                    <motion.span className="absolute inset-y-0 left-0 rounded-full bg-primary" initial={false}
                      animate={{ width: done || current || mode === "edit" ? "100%" : "0%", opacity: current ? 1 : 0.55 }}
                      transition={{ duration: 0.5, ease: EASE }} />
                  </span>
                  <span className="mt-2.5 flex items-center gap-1.5">
                    <span className={`font-mono text-[11px] ${current ? "text-primary" : "text-subtle"}`}>0{index + 1}</span>
                    <span className={`hidden text-xs font-medium sm:inline ${current ? "text-foreground" : "text-muted"}`}>{s.title}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      <AnimatePresence mode="wait" initial={false} custom={direction}>
        <motion.div key={step.key} initial={{ opacity: 0, x: 24 * direction }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 * direction }} transition={{ duration: 0.3, ease: EASE }}>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-muted">Step {stepIndex + 1} of {STEPS.length}</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight">{step.title}</h2>
          <p className="mt-1 text-sm text-muted">{step.description}</p>
        </motion.div>
      </AnimatePresence>

      {status.error && <Alert tone="error">{status.error}</Alert>}
      {status.saved && <Alert tone="success">Profile saved.</Alert>}

      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (mode === "create" && !isLast) goTo(stepIndex + 1);
          else submit();
        }}
      >
        {step.key === "personal" && (
          <>
            <Input label="Name" required value={form.personal.name} onChange={set("personal", "name")} error={errors["personal.name"]} autoComplete="name" />
            <Input label="Education" hint="e.g. BSc Computer Science, 2025" value={form.personal.education} onChange={set("personal", "education")} error={errors["personal.education"]} />
            <ChoiceGroup legend="Experience" name="experience" options={EXPERIENCE_LEVELS} value={form.personal.experience_level}
              onChange={(value) => setForm((f) => ({ ...f, personal: { ...f.personal, experience_level: value } }))} />
          </>
        )}

        {step.key === "target" && (
          <>
            <Select label="Role" required options={TARGET_ROLES} value={form.target.role} onChange={set("target", "role")} error={errors["target.role"]} />
            <Input label="Target company" hint="Optional. Used later for company-specific prep." value={form.target.company} onChange={set("target", "company")} />
            <Textarea
              label="Job description"
              hint="Optional. Paste the JD if you have one."
              maxLength={50000}
              value={form.target.job_description}
              onChange={set("target", "job_description")}
              error={errors["target.job_description"]}
            />
          </>
        )}

        {step.key === "skills" && (
          <SkillsInput value={form.skills} onChange={(skills) => setForm((f) => ({ ...f, skills }))} suggestions={SKILL_SUGGESTIONS[form.target.role]} />
        )}

        {step.key === "preferences" && (
          <>
            <ChoiceGroup legend="Difficulty" name="difficulty" options={DIFFICULTIES} value={form.preferences.preferred_difficulty}
              onChange={(value) => setForm((f) => ({ ...f, preferences: { ...f.preferences, preferred_difficulty: value } }))} />
            <ChoiceGroup legend="You answer by" name="input_mode" options={IO_CHOICES} value={form.preferences.input_mode}
              onChange={(value) => setForm((f) => ({ ...f, preferences: { ...f.preferences, input_mode: value } }))} />
            <ChoiceGroup legend="VERA responds with" name="output_mode" options={IO_CHOICES} value={form.preferences.output_mode}
              onChange={(value) => setForm((f) => ({ ...f, preferences: { ...f.preferences, output_mode: value } }))} />
          </>
        )}

        <div className="flex items-center justify-between gap-3 border-t border-border pt-5">
          {mode === "create" ? (
            <>
              <Button type="button" variant="ghost" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
                Back
              </Button>
              <Button type="submit" loading={status.saving}>
                {isLast ? "Finish setup" : "Continue"} <span aria-hidden="true">→</span>
              </Button>
            </>
          ) : (
            <>
              <span className="text-xs text-muted">Changes apply to your next interview.</span>
              <Button type="submit" loading={status.saving}>
                Save changes
              </Button>
            </>
          )}
        </div>
      </form>
    </div>
  );
}
