"use client";

import { motion } from "motion/react";

import { CheckIcon, XIcon } from "@/components/ui/icons";
import Spinner from "@/components/ui/Spinner";
import { EXECUTION_STATUS } from "@/lib/interviewOptions";

const TONE = {
  success: "border-success/30 bg-success-soft text-success",
  danger: "border-danger/30 bg-danger/10 text-danger",
  warning: "border-warning/30 bg-warning-soft text-warning",
};
const EASE = [0.16, 1, 0.3, 1];
const LIST = { hidden: {}, shown: { transition: { staggerChildren: 0.06 } } };
const ROW = { hidden: { opacity: 0, x: -6 }, shown: { opacity: 1, x: 0, transition: { duration: 0.35, ease: EASE } } };

function Pre({ label, text, tone = "" }) {
  if (!text) return null;
  return (
    <div>
      <p className="mb-1 font-mono text-[11px] uppercase tracking-wider text-subtle">{label}</p>
      <pre className={`max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-border bg-background p-3 font-mono text-xs ${tone}`}>{text}</pre>
    </div>
  );
}

/** One segment per test, green or red, filling in left to right: the result at a glance. */
function PassStrip({ tests }) {
  return (
    <motion.div variants={LIST} className="flex gap-1" aria-hidden="true">
      {tests.map((t, i) => (
        <motion.span key={i} variants={{ hidden: { scaleY: 0 }, shown: { scaleY: 1, transition: { duration: 0.3 } } }}
          className={`h-1.5 flex-1 origin-bottom rounded-full ${t.passed ? "bg-success" : "bg-danger"}`} />
      ))}
    </motion.div>
  );
}

/**
 * The console under the editor: a run's verdict, a pass/fail strip, then each test arriving in turn. A hidden
 * test in serious mode comes without its input or output (the server strips them), so it shows pass/fail
 * only. `source` says whether this was a Run (the visible examples) or the submission (every test).
 */
export default function OutputPanel({ result, source, pending }) {
  if (pending) {
    return (
      <div className="flex items-center gap-3 py-2 font-mono text-xs text-muted" role="status">
        <Spinner className="size-4" />
        {pending === "submit" ? "Running every test, hidden ones too…" : "Running against the examples…"}
      </div>
    );
  }
  if (!result) {
    return (
      <p className="py-1 font-mono text-xs leading-relaxed text-subtle">
        <span className="text-muted">$</span> Run checks your code against the examples. Submit runs every test, hidden ones too.
      </p>
    );
  }
  const status = EXECUTION_STATUS[result.status] || { label: result.status, tone: "warning" };
  const tests = result.graded ? result.test_results || [] : [];
  return (
    <motion.div className="space-y-3" aria-live="polite" initial="hidden" animate="shown" variants={LIST}>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <motion.span variants={ROW} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${TONE[status.tone]}`}>
          {status.tone === "success" ? <CheckIcon className="size-3.5" strokeWidth={2.4} /> : <XIcon className="size-3.5" strokeWidth={2.4} />}
          {status.label}
        </motion.span>
        {result.graded ? (
          <span className="font-mono text-xs tabular-nums">{result.passed_tests}/{result.total_tests} tests passed</span>
        ) : (
          <span className="text-xs text-muted">Ran as written; this language isn&apos;t graded against tests yet.</span>
        )}
        {result.runtime_ms != null && <span className="font-mono text-xs tabular-nums text-subtle">{result.runtime_ms} ms</span>}
        <span className="ml-auto font-mono text-[11px] uppercase tracking-wider text-subtle">
          {source === "submit" ? (result.graded ? "Submitted · every test" : "Submitted") : (result.graded ? "Run · examples" : "Run")}
        </span>
      </div>

      {tests.length > 0 && <PassStrip tests={tests} />}

      {tests.length > 0 && (
        <motion.ul variants={LIST} className="divide-y divide-border overflow-hidden rounded-xl border border-border text-xs">
          {tests.map((t, i) => (
            <motion.li key={i} variants={ROW} className="flex gap-2.5 bg-background/40 px-3 py-2">
              {t.passed
                ? <CheckIcon className="mt-px size-3.5 shrink-0 text-success" strokeWidth={2.4} />
                : <XIcon className="mt-px size-3.5 shrink-0 text-danger" strokeWidth={2.4} />}
              <span className="sr-only">{t.passed ? "Passed" : "Failed"}</span>
              {t.input == null ? (
                <span className="text-muted">Hidden test {t.passed ? "passed" : "failed"}</span>
              ) : (
                <span className="min-w-0 flex-1 space-y-0.5 font-mono">
                  <span className="block truncate" title={t.input}><span className="text-subtle">in </span>{t.input}{t.is_hidden && <span className="text-subtle"> · hidden</span>}</span>
                  <span className="block truncate"><span className="text-subtle">expected </span>{t.expected}</span>
                  {!t.passed && <span className="block truncate text-danger"><span className="text-subtle">got </span>{t.actual}</span>}
                </span>
              )}
            </motion.li>
          ))}
        </motion.ul>
      )}
      <Pre label="Compiler" text={result.compile_output} tone="text-danger" />
      <Pre label="Errors" text={result.stderr} tone="text-danger" />
      <Pre label="Your output (print)" text={result.stdout} />
    </motion.div>
  );
}
