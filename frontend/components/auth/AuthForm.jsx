"use client";

import { AnimatePresence, motion } from "motion/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { api, fieldErrors } from "@/lib/api";
import { safeNextPath } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";

const EASE = [0.16, 1, 0.3, 1];
const COPY = {
  signin: { title: "Welcome back.", accent: "back.", sub: "VERA kept your seat. Sign in to continue.", submit: "Sign in" },
  signup: { title: "Take the seat.", accent: "seat.", sub: "Create your account. Your first interview is a minute away.", submit: "Create account" },
};

/** 0-4: length, then a mix of letters, digits and symbols. A nudge, not a rule (the server checks 8+ chars). */
function strength(password) {
  if (!password) return 0;
  let score = password.length >= 8 ? 1 : 0;
  if (password.length >= 12) score += 1;
  if (/[a-z]/i.test(password) && /\d/.test(password)) score += 1;
  if (/[^a-z0-9]/i.test(password)) score += 1;
  return score;
}
const STRENGTH = ["Too short", "Okay", "Good", "Strong", "Very strong"];

function StrengthMeter({ password }) {
  const s = strength(password);
  return (
    <div className="flex items-center gap-3" aria-live="polite">
      <div className="flex flex-1 gap-1" aria-hidden="true">
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= s ? (s >= 3 ? "bg-success" : "bg-primary") : "bg-border-strong"}`} />
        ))}
      </div>
      <span className="w-20 text-right text-xs text-muted">{password ? STRENGTH[s] : "8+ characters"}</span>
    </div>
  );
}

/** One heading word in the serif accent, cross-fading when the mode changes. */
function Title({ mode }) {
  const { title, accent } = COPY[mode];
  const plain = title.replace(accent, "");
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.h1 key={mode} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
        exit={{ opacity: 0, y: -10, filter: "blur(4px)" }} transition={{ duration: 0.35, ease: EASE }}
        className="text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
        {plain}<span className="font-serif font-normal italic tracking-[-0.02em]">{accent}</span>
      </motion.h1>
    </AnimatePresence>
  );
}

/**
 * Sign in and create account in one card (Phase 7.5). The card lives in the auth layout, so moving between
 * /login and /register never re-renders it: the tab slides, the Name field and the strength meter fold in
 * or out, the words cross-fade, and whatever you typed stays. On success it calls `onSuccess(destination)`,
 * which plays the camera move to the desk before navigating.
 */
export default function AuthForm({ onSuccess }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const mode = pathname.startsWith("/register") ? "signup" : "signin";
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  function switchTo(next) {
    if (next === mode) return;
    setErrors({});
    setFormError(null);
    const query = searchParams.toString();
    router.replace(`${next === "signup" ? "/register" : "/login"}${query ? `?${query}` : ""}`, { scroll: false });
  }

  function validate() {
    const next = {};
    if (mode === "signup" && !form.name.trim()) next.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address";
    if (mode === "signup") {
      if (form.password.length < 8) next.password = "Use at least 8 characters";
      else if (new TextEncoder().encode(form.password).length > 72) next.password = "Password is too long";
    } else if (!form.password) {
      next.password = "Enter your password";
    }
    return next;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const clientErrors = validate();
    setErrors(clientErrors);
    setFormError(null);
    if (Object.keys(clientErrors).length) return;

    setSubmitting(true);
    try {
      const session = mode === "signup"
        ? await api.auth.register({ name: form.name.trim(), email: form.email, password: form.password })
        : await api.auth.login({ email: form.email, password: form.password });
      setSession(session);
      // New accounts go to onboarding; signing in returns to the landing page, or to the page that sent you here.
      onSuccess(mode === "signup" ? "/profile/setup" : safeNextPath(searchParams.get("next"), "/"));
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(error.code === "email_taken" ? "That email is already registered. Sign in instead." : error.message);
      setSubmitting(false);
    }
  }

  return (
    <motion.form layout onSubmit={handleSubmit} noValidate transition={{ layout: { duration: 0.45, ease: EASE } }} className="space-y-6">
      <div role="tablist" aria-label="Sign in or create an account" className="grid grid-cols-2 rounded-xl border border-border bg-background/50 p-1">
        {["signin", "signup"].map((m) => (
          <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => switchTo(m)}
            className={`relative h-10 rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${mode === m ? "text-foreground" : "text-muted hover:text-foreground"}`}>
            {mode === m && <motion.span layoutId="auth-tab" className="absolute inset-0 rounded-lg bg-raised shadow-[inset_0_1px_0_rgb(255_255_255/0.06)]" transition={{ type: "spring", duration: 0.45, bounce: 0.15 }} />}
            <span className="relative">{m === "signin" ? "Sign in" : "Create account"}</span>
          </button>
        ))}
      </div>

      <motion.div layout="position">
        <Title mode={mode} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={mode} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
            className="mt-3 text-muted">{COPY[mode].sub}</motion.p>
        </AnimatePresence>
      </motion.div>

      {formError && <Alert tone="error">{formError}</Alert>}

      <div className="space-y-4">
        <AnimatePresence initial={false}>
          {mode === "signup" && (
            <motion.div key="name" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4, ease: EASE }} className="overflow-hidden">
              <div className="pb-0.5"><Input label="Name" autoComplete="name" value={form.name} onChange={update("name")} error={errors.name} /></div>
            </motion.div>
          )}
        </AnimatePresence>
        <motion.div layout="position">
          <Input label="Email" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={update("email")} error={errors.email} />
        </motion.div>
        <motion.div layout="position" className="space-y-2.5">
          <Input label="Password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={form.password} onChange={update("password")} error={errors.password} />
          <AnimatePresence initial={false}>
            {mode === "signup" && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.35, ease: EASE }} className="overflow-hidden">
                <StrengthMeter password={form.password} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>

      <motion.div layout="position">
        <Button type="submit" size="lg" className="w-full" loading={submitting}>
          {COPY[mode].submit} <span aria-hidden="true">→</span>
        </Button>
      </motion.div>
    </motion.form>
  );
}
