"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { api, fieldErrors } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

export default function RegisterForm() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  function validate() {
    const next = {};
    if (!form.name.trim()) next.name = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(form.email)) next.email = "Enter a valid email address";
    if (form.password.length < 8) next.password = "Use at least 8 characters";
    else if (new TextEncoder().encode(form.password).length > 72) next.password = "Password is too long";
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
      const session = await api.auth.register({ ...form, name: form.name.trim() });
      setSession(session);
      router.replace("/profile/setup");
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(error.code === "email_taken" ? "That email is already registered. Try signing in instead." : error.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Create your account</h1>
        <p className="mt-1 text-sm text-muted">It takes a minute. Then we&apos;ll set up your profile.</p>
      </div>
      {formError && <Alert tone="error">{formError}</Alert>}
      <Input label="Name" autoComplete="name" required value={form.name} onChange={update("name")} error={errors.name} />
      <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} error={errors.email} />
      <Input
        label="Password"
        type="password"
        autoComplete="new-password"
        required
        hint="At least 8 characters."
        value={form.password}
        onChange={update("password")}
        error={errors.password}
      />
      <Button type="submit" className="w-full" loading={submitting}>
        Create account
      </Button>
      <p className="text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
