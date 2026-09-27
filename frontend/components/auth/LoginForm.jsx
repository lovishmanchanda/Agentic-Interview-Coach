"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";
import { api, fieldErrors } from "@/lib/api";
import { safeNextPath } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [form, setForm] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }));

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    try {
      const session = await api.auth.login(form);
      setSession(session);
      router.replace(safeNextPath(searchParams.get("next")));
    } catch (error) {
      setErrors(fieldErrors(error));
      setFormError(error.message);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div>
        <h1 className="text-2xl font-semibold">Welcome back</h1>
        <p className="mt-1 text-sm text-muted">Sign in to continue practising.</p>
      </div>
      {formError && <Alert tone="error">{formError}</Alert>}
      <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={update("email")} error={errors.email} />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        value={form.password}
        onChange={update("password")}
        error={errors.password}
      />
      <Button type="submit" className="w-full" loading={submitting}>
        Sign in
      </Button>
      <p className="text-center text-sm text-muted">
        New here?{" "}
        <Link href="/register" className="font-medium text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </form>
  );
}
