"use client";

import { useReportWebVitals } from "next/web-vitals";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import { flush, newPage, reportError, reportVital, telemetryEnabled } from "@/lib/telemetry";

const FLUSH_EVERY_MS = 15_000;

/**
 * Reports real visitors' Core Web Vitals and uncaught errors (lib/telemetry.ts) to the backend, for the admin
 * dashboard. Rendered once, in the root layout; renders nothing. (React render errors reach the error boundaries
 * instead, app/error.js and app/global-error.js, which report them too.)
 */
export default function Telemetry() {
  useReportWebVitals(reportVital); // a stable function: Next.js asks for that, so metrics aren't reported twice
  const pathname = usePathname();

  useEffect(() => {
    newPage();
  }, [pathname]);

  useEffect(() => {
    if (!telemetryEnabled()) return undefined;
    const onError = (event) => reportError(event.error ?? event.message);
    const onRejection = (event) => reportError(event.reason);
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    document.addEventListener("visibilitychange", onHidden);
    window.addEventListener("pagehide", flush);
    const timer = setInterval(flush, FLUSH_EVERY_MS);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      document.removeEventListener("visibilitychange", onHidden);
      window.removeEventListener("pagehide", flush);
      clearInterval(timer);
    };
  }, []);

  return null;
}
