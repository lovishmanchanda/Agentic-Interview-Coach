"use client";

import { useCallback, useEffect, useState } from "react";

import PromptSettings from "@/components/admin/PromptSettings";
import Alert from "@/components/ui/Alert";
import Card from "@/components/ui/Card";
import ChoiceGroup from "@/components/ui/ChoiceGroup";
import Spinner from "@/components/ui/Spinner";
import { api } from "@/lib/api";

const REFRESH_MS = 15000;
const DAY_OPTIONS = [1, 7, 30].map((d) => ({ value: d, label: d === 1 ? "Today" : `${d} days` }));
const fmt = new Intl.NumberFormat();
const ms = (v) => (v == null ? "–" : v >= 1000 ? `${(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);
const pct = (v) => `${(v * 100).toFixed(1)}%`;
const usd = (v) => `$${(v ?? 0).toFixed(v >= 1 ? 2 : 4)}`;

function Tile({ label, value, hint, warn }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${warn ? "text-danger" : ""}`}>{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Table({ columns, rows, empty = "Nothing yet." }) {
  if (!rows?.length) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr>{columns.map((c) => <th key={c.key} className={`py-1.5 font-medium ${c.right ? "text-right" : ""}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-border/60">
              {columns.map((c) => <td key={c.key} className={`py-1.5 ${c.right ? "text-right" : ""} ${c.mono ? "font-mono" : ""}`}>{c.format ? c.format(r[c.key], r) : r[c.key] ?? "–"}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Tokens per day: one series, one hue (--chart-mark), value at the bar tip, a table view is the Table above. */
function DailyBars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.tokens));
  if (!rows.length) return null;
  return (
    <ul className="space-y-1.5" aria-label="Tokens per day">
      {rows.map((r) => (
        <li key={r.day} className="grid grid-cols-[5.5rem_1fr] items-center gap-3 text-xs">
          <span className="text-muted tabular-nums">{r.day}</span>
          <span className="flex items-center gap-2">
            <span className="h-3 rounded-r-[4px] bg-chart-mark" style={{ width: `${Math.max(1, (r.tokens / max) * 85)}%` }} />
            <span className="tabular-nums">{fmt.format(r.tokens)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

export default function AdminPage() {
  const [metrics, setMetrics] = useState(null);
  const [usage, setUsage] = useState(null);
  const [prompts, setPrompts] = useState(null);
  const [errors, setErrors] = useState([]);
  const [days, setDays] = useState(7);
  const [loadError, setLoadError] = useState(null);

  const loadLive = useCallback(() => {
    api.admin.metrics().then(setMetrics).catch(setLoadError);
    api.admin.llmCalls({ status: "error", limit: 10 }).then(setErrors).catch(() => {});
  }, []);
  const loadPrompts = useCallback(() => api.admin.prompts().then(setPrompts).catch(setLoadError), []);

  useEffect(() => {
    loadLive();
    loadPrompts();
    const id = setInterval(loadLive, REFRESH_MS);
    return () => clearInterval(id);
  }, [loadLive, loadPrompts]);
  useEffect(() => {
    api.admin.usage(days).then(setUsage).catch(setLoadError);
  }, [days]);

  if (loadError) {
    return loadError.code === "admin_only"
      ? <Alert tone="error" title="Admins only">This page needs an admin account (ADMIN_EMAILS on the server).</Alert>
      : <Alert tone="error">{loadError.message}</Alert>;
  }
  if (!metrics || !usage || !prompts) return <Spinner label="Loading the dashboard…" />;

  const totals = usage.by_day.reduce((t, r) => ({ calls: t.calls + r.calls, tokens: t.tokens + r.tokens,
    cost: t.cost + r.cost_usd, errors: t.errors + r.errors }), { calls: 0, tokens: 0, cost: 0, errors: 0 });
  const { http, llm, websocket } = metrics;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin</h1>
        <p className="mt-1 text-sm text-muted">Live numbers cover the last {metrics.window_minutes} minutes on this server and refresh every 15 s.</p>
      </div>

      {metrics.alerts.length > 0 ? (
        <Alert tone="error" title="Alerts firing">
          <ul className="list-disc pl-5">{metrics.alerts.map((a) => <li key={a.name}>{a.description}</li>)}</ul>
        </Alert>
      ) : <p className="text-sm text-success">No alerts firing.</p>}

      <section aria-labelledby="live" className="space-y-3">
        <h2 id="live" className="text-base font-semibold">Live</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Requests" value={fmt.format(http.count)} hint={`p95 ${ms(http.p95_ms)}`} />
          <Tile label="Request errors (5xx)" value={pct(http.error_rate)} warn={http.error_rate > 0.05} />
          <Tile label="AI calls" value={fmt.format(llm.count)} hint={`p95 ${ms(llm.p95_ms)}`} warn={(llm.p95_ms ?? 0) > 20000} />
          <Tile label="AI errors" value={pct(llm.error_rate)} warn={llm.error_rate > 0.1} />
          <Tile label="Interviews live" value={websocket.active} hint={`${websocket.sessions} sessions, p50 ${websocket.p50_duration_s}s`} />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Endpoints">
            <Table rows={http.by_route} columns={[
              { key: "key", label: "Route", mono: true }, { key: "count", label: "Requests", right: true },
              { key: "errors", label: "5xx", right: true }, { key: "p95_ms", label: "p95", right: true, format: ms }]} />
          </Card>
          <Card title="AI calls">
            <Table rows={llm.by_call} columns={[
              { key: "key", label: "Call · model", mono: true }, { key: "count", label: "Calls", right: true },
              { key: "errors", label: "Errors", right: true }, { key: "p95_ms", label: "p95", right: true, format: ms }]} />
          </Card>
        </div>
      </section>

      <section aria-labelledby="usage" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="usage" className="text-base font-semibold">Usage and cost</h2>
          <ChoiceGroup legend="Period" name="days" value={days} onChange={setDays} options={DAY_OPTIONS} />
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Tokens" value={fmt.format(totals.tokens)} hint={`${fmt.format(totals.calls)} AI calls`} />
          <Tile label="Estimated cost" value={usd(totals.cost)} hint="From GROQ_PRICE_* rates" />
          <Tile label="Failed AI calls" value={fmt.format(totals.errors)} />
          <Tile label="Cut short" value={`${usage.budget_wrap_ups} + ${usage.time_limit_wrap_ups}`} hint="token budget + time limit" />
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <Card title="Tokens per day"><DailyBars rows={usage.by_day} /></Card>
          <Card title="By prompt version" description="Compare A/B variants here.">
            <Table rows={usage.by_prompt_version} columns={[
              { key: "prompt_version", label: "Prompt", mono: true, format: (v) => v || "(none)" },
              { key: "calls", label: "Calls", right: true }, { key: "tokens", label: "Tokens", right: true, format: (v) => fmt.format(v) },
              { key: "errors", label: "Errors", right: true }, { key: "avg_latency_ms", label: "Avg", right: true, format: ms }]} />
          </Card>
          <Card title="By model">
            <Table rows={usage.by_model} columns={[
              { key: "model", label: "Model", mono: true }, { key: "calls", label: "Calls", right: true },
              { key: "tokens", label: "Tokens", right: true, format: (v) => fmt.format(v) }, { key: "cost_usd", label: "Cost", right: true, format: usd }]} />
          </Card>
          <Card title="Top candidates" description={`Daily cap: ${usage.daily_token_limit_per_user ? fmt.format(usage.daily_token_limit_per_user) + " tokens" : "none"}`}>
            <Table rows={usage.top_candidates} columns={[
              { key: "candidate_id", label: "Candidate", mono: true, format: (v) => (v ? `${v.slice(0, 8)}…` : "(system)") },
              { key: "calls", label: "Calls", right: true }, { key: "tokens", label: "Tokens", right: true, format: (v) => fmt.format(v) },
              { key: "cost_usd", label: "Cost", right: true, format: usd }]} />
          </Card>
        </div>
      </section>

      <Card title="Prompt versions" description="Switch a prompt's version or split traffic (A/B) without a deploy. A split is stable per interview; other servers pick it up within 30 s.">
        <PromptSettings prompts={prompts} onSaved={loadPrompts} />
      </Card>

      <Card title="Recent AI errors">
        <Table rows={errors} empty="No failed AI calls." columns={[
          { key: "at", label: "When", format: (v) => new Date(v).toLocaleString() }, { key: "call_type", label: "Call" },
          { key: "prompt_version", label: "Prompt", mono: true }, { key: "error", label: "Error", mono: true },
          { key: "session_id", label: "Session", mono: true, format: (v) => (v ? `${v.slice(0, 8)}…` : "–") }]} />
      </Card>
    </div>
  );
}
