"use client";

import ErrorState from "@/components/layout/ErrorState";

/** Errors inside the signed-in app: rendered within the app shell, so the navigation stays usable. */
export default function AppError({ error, retry }) {
  return <ErrorState error={error} retry={retry} homeHref="/dashboard" />;
}
