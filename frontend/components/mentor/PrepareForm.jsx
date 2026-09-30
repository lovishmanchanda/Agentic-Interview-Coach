"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

const MAX_JD = 50000;
const WEEK_OPTIONS = [["", "Let ARIA decide"], ...[1, 2, 3, 4, 6, 8, 12].map((w) => [String(w), `${w} week${w > 1 ? "s" : ""}`])];

/**
 * Company preparation (Phase 3): a company, an optional timeline and an optional job description. The plan comes
 * back as a Mentor message in this conversation (typing "Prepare me for Google" in the chat works too).
 */
export default function PrepareForm({ onSubmit, onCancel, busy }) {
  const [company, setCompany] = useState("");
  const [weeks, setWeeks] = useState("");
  const [jdText, setJdText] = useState("");

  function submit(event) {
    event.preventDefault();
    if (!company.trim() || busy) return;
    onSubmit({ company: company.trim(), jdText: jdText.trim() || undefined, weeks: weeks ? Number(weeks) : undefined });
  }

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-primary/30 bg-[linear-gradient(to_bottom,var(--primary-soft),var(--surface)_60%)] p-5 sm:p-6">
      <div>
        <h2 className="text-base font-semibold">Prepare for a company</h2>
        <p className="mt-1 text-sm text-muted">
          ARIA looks up how the company interviews, compares it with your scores so far, and writes a week-by-week plan.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Company" value={company} maxLength={60} required autoFocus
          onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Google, Flipkart, Stripe" />
        <div>
          <label htmlFor="prep-weeks" className="mb-2 block text-sm font-medium">Interview in</label>
          <select id="prep-weeks" value={weeks} onChange={(e) => setWeeks(e.target.value)}
            className="h-12 w-full rounded-xl border border-border-strong bg-background/60 px-4 text-[15px] focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15">
            {WEEK_OPTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label htmlFor="prep-jd" className="mb-2 block text-sm font-medium">Job description <span className="font-normal text-muted">(optional)</span></label>
        <textarea id="prep-jd" value={jdText} maxLength={MAX_JD} rows={5} onChange={(e) => setJdText(e.target.value)}
          placeholder="Paste the job description to tailor the plan to the role."
          className="w-full rounded-xl border border-border-strong bg-background/60 p-3 text-sm placeholder:text-subtle focus:border-primary focus:outline-none focus:ring-4 focus:ring-primary/15" />
        {jdText.length > MAX_JD - 2000 && <p className="mt-1 text-xs text-muted tabular-nums">{jdText.length}/{MAX_JD}</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" loading={busy} disabled={!company.trim()}>Make my plan</Button>
      </div>
    </form>
  );
}
