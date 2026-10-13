/**
 * What visitors' browsers report to the backend (api/v1/telemetry.py): Core Web Vitals and uncaught errors, so
 * the admin dashboard shows how the site really behaves. Self-hosted, nothing personal: the page path (the
 * backend drops IDs and query strings), the metric or the error's type, message and a short stack.
 *
 * Events queue up and go in small batches: every 15 s, and when the tab is hidden or closed (fetch keepalive,
 * which outlives the page but which browsers cap at 64 KB in flight: events are trimmed to what the server keeps,
 * batches are split by size, and keepalive is used only within that budget). Only in production builds, or
 * with NEXT_PUBLIC_TELEMETRY=1.
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

const MAX_BATCH = 25; // events per request (the server's limit)
const MAX_BATCH_BYTES = 16_000;
const KEEPALIVE_BUDGET = 60_000; // under the browsers' 64 KB cap for keepalive requests in flight
const MAX_ERRORS_PER_PAGE = 10; // a render loop throwing the same error shouldn't flood anything
// The server keeps a fingerprint of the message and a few code locations from the stack; send no more than that.
const MAX_MESSAGE = 300;
const MAX_STACK_LINES = 8;
const MAX_STACK = 1_500;

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
    message: err.message.slice(0, MAX_MESSAGE),
    stack: (err.stack || "").split("\n").slice(0, MAX_STACK_LINES + 1).join("\n").slice(0, MAX_STACK) });
}

/** Split events into request bodies of at most MAX_BATCH events and MAX_BATCH_BYTES each. */
export function batches(events: ClientEvent[], maxBytes = MAX_BATCH_BYTES, maxCount = MAX_BATCH): string[] {
  const bodies: string[] = [];
  let current: ClientEvent[] = [];
  const body = (list: ClientEvent[]) => JSON.stringify({ events: list });
  for (const event of events) {
    const next = [...current, event];
    if (current.length && (next.length > maxCount || body(next).length > maxBytes)) {
      bodies.push(body(current));
      current = [event];
    } else {
      current = next;
    }
  }
  if (current.length) bodies.push(body(current));
  return bodies;
}

/** Send what's queued (in batches the backend accepts). Safe to call often; does nothing when empty. */
export function flush() {
  if (!telemetryEnabled()) return;
  const events = [...vitals.values(), ...errors];
  vitals.clear();
  errors = [];
  let inFlight = 0;
  for (const body of batches(events)) {
    inFlight += body.length;
    fetch(`${API_URL}/api/v1/telemetry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: inFlight <= KEEPALIVE_BUDGET, // delivered even as the page closes, within the browser's cap
      credentials: "omit",
    }).catch(() => {}); // telemetry never gets in the way
  }
}

/** A page navigation (client-side): new page, new error budget. */
export function newPage() {
  errorsThisPage = 0;
  seen.clear();
}
