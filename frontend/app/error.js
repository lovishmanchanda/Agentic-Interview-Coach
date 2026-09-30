"use client";

import ErrorState from "@/components/layout/ErrorState";

/** Catches rendering errors anywhere under the root layout that a nearer error.js doesn't. */
export default function RootError({ error, retry }) {
  return (
    <main className="px-4">
      <ErrorState error={error} retry={retry} />
    </main>
  );
}
