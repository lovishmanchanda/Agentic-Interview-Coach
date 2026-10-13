/**
 * What visitors' browsers report to the backend (api/v1/telemetry.py): Core Web Vitals and uncaught errors, so
 * the admin dashboard shows how the site really behaves. Self-hosted, nothing personal: the page path (the
 * backend drops IDs and query strings), the metric or the error's type, message and a short stack.
 *
 * Events queue up and go in small batches: every 15 s, and when the tab is hidden or closed (fetch keepalive,
 * which outlives the page). Only in production builds, or with NEXT_PUBLIC_TELEMETRY=1.
 */
import { API_URL } from "@/lib/api";

export type ClientEvent = {
  kind: "vital" | "error";
  name: string;
  value?: number | null;
  rating?: "good" | "needs-improvement" | "poor" | null;
  path: string;
  message?: string | null;
  stack?: string | null;
};

const MAX_BATCH = 25;
const MAX_ERRORS_PER_PAGE = 10; // a render loop throwing the same error shouldn't flood anything

export const telemetryEnabled = () =>
  typeof window !== "undefined" && (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_TELEMETRY === "1");

const vitals = new Map<string, ClientEvent>(); // by metric id: CLS and INP update as the page lives; keep the latest
let errors: ClientEvent[] = [];
let errorsThisPage = 0;
const seen = new Set<string>();

export function reportVital(metric: { id: string; name: string; value: number; rating?: ClientEvent["rating"] }) {
  if (!telemetryEnabled()) return;
  vitals.set(metric.id, { kind: "vital", name: metric.name, value: Math.round(metric.value * 1000) / 1000,
    rating: metric.rating ?? null, path: window.location.pathname });
}

export function reportError(error: unknown) {
  if (!telemetryEnabled() || errorsThisPage >= MAX_ERRORS_PER_PAGE) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const key = `${err.name}:${err.message}`;
  if (seen.has(key)) return; // once per page load
  seen.add(key);
  errorsThisPage += 1;
  errors.push({ kind: "error", name: (err.name || "Error").slice(0, 40), path: window.location.pathname,
    message: err.message.slice(0, 2000), stack: (err.stack || "").split("\n").slice(0, 8).join("\n").slice(0, 8000) });
}

/** Send what's queued (in batches the backend accepts). Safe to call often; does nothing when empty. */
export function flush() {
  if (!telemetryEnabled()) return;
  const events = [...vitals.values(), ...errors];
  vitals.clear();
  errors = [];
  for (let i = 0; i < events.length; i += MAX_BATCH) {
    fetch(`${API_URL}/api/v1/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ events: events.slice(i, i + MAX_BATCH) }),
      keepalive: true, // still delivered when the page is being closed
      credentials: "omit",
    }).catch(() => {}); // telemetry never gets in the way
  }
}

/** A page navigation (client-side): new page, new error budget. */
export function newPage() {
  errorsThisPage = 0;
  seen.clear();
}
