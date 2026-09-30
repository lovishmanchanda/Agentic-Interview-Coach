"use client";

import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { api } from "@/lib/api";

function outcomes(o) {
  if (!o) return "–";
  return Object.entries(o).map(([k, n]) => `${k} ${n}`).join(" · ");
}

/** One prompt: its versions with how each has done, and the traffic split (empty = the version named in code). */
function PromptRow({ prompt, onSaved }) {
  const [weights, setWeights] = useState(() => Object.fromEntries(prompt.versions.map((v) => [v.version, prompt.weights[v.version] ?? 0])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const total = Object.values(weights).reduce((a, b) => a + (Number(b) || 0), 0);
  const active = Object.keys(prompt.weights).length > 0;
  const choosable = prompt.versions.length > 1;

  async function run(action) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const save = () => run(() => api.admin.setPrompt(prompt.name,
    Object.fromEntries(Object.entries(weights).map(([v, w]) => [v, Number(w) || 0]).filter(([, w]) => w > 0))));
  const reset = () => run(() => api.admin.resetPrompt(prompt.name));

  return (
    <li className="space-y-2 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-sm font-medium">{prompt.name}</p>
        <p className="text-xs text-muted">
          {active ? `Split: ${Object.entries(prompt.weights).map(([v, w]) => `${v} ${w}%`).join(", ")}` : "Using the version in code"}
          {prompt.updated_by && ` · changed by ${prompt.updated_by}`}
        </p>
      </div>
      <table className="w-full text-left text-xs">
        <thead className="text-muted">
          <tr><th className="py-1 font-medium">Version</th><th className="py-1 font-medium">Evaluations (avg score)</th>
            <th className="py-1 font-medium">Agent outcomes</th>
            {choosable && <th className="py-1 text-right font-medium">Traffic %</th>}</tr>
        </thead>
        <tbody className="tabular-nums">
          {prompt.versions.map((v) => (
            <tr key={v.version} className="border-t border-border/60">
              <td className="py-1.5 font-mono">{v.version}</td>
              <td className="py-1.5">{v.evaluations ? `${v.evaluations.n} (${v.evaluations.avg_score})` : "–"}</td>
              <td className="py-1.5">{outcomes(v.agent_outcomes)}</td>
              {choosable && <td className="py-1.5 text-right">
                <label className="sr-only" htmlFor={`${prompt.name}-${v.version}`}>{`${prompt.name} ${v.version} traffic percent`}</label>
                <input id={`${prompt.name}-${v.version}`} type="number" min={0} max={100} step={5} value={weights[v.version]}
                  onChange={(e) => setWeights((w) => ({ ...w, [v.version]: e.target.value }))}
                  className="h-8 w-20 rounded-md border border-border bg-surface px-2 text-right text-xs" />
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
      {choosable && <div className="flex flex-wrap items-center justify-end gap-2">
        <span className={`text-xs ${total === 100 ? "text-muted" : "text-danger"}`}>Total {total}% (must be 100)</span>
        {active && <Button size="sm" variant="ghost" onClick={reset} disabled={busy}>Back to code default</Button>}
        <Button size="sm" variant="secondary" onClick={save} loading={busy} disabled={total !== 100}>Save split</Button>
      </div>}
      {error && <Alert tone="error">{error}</Alert>}
    </li>
  );
}

export default function PromptSettings({ prompts, onSaved }) {
  // Prompts with a choice of versions first; the rest are listed for their stats.
  const ordered = [...prompts].sort((a, b) => (b.versions.length > 1) - (a.versions.length > 1));
  return (
    <ul className="divide-y divide-border">
      {ordered.map((p) => <PromptRow key={`${p.name}:${JSON.stringify(p.weights)}`} prompt={p} onSaved={onSaved} />)}
    </ul>
  );
}
