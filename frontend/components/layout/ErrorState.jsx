"use client";

import { useEffect } from "react";

import Button from "@/components/ui/Button";

/**
 * The body of the error pages (app/error.js, app/(app)/error.js). Shows a plain message, never the error's
 * text: in production Next.js replaces server errors with a digest, and client errors can carry internals.
 */
export default function ErrorState({ error, retry, homeHref = "/" }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="mx-auto flex max-w-md flex-col items-center py-24 text-center">
      <p className="text-sm font-medium text-danger">Something went wrong</p>
      <h1 className="mt-2 text-2xl font-semibold">This page hit an unexpected error</h1>
      <p className="mt-3 text-muted">Your data is safe. Try again, and if it keeps happening, reload the page.</p>
      {error?.digest && <p className="mt-2 text-xs text-muted">Reference: {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button href={homeHref} variant="secondary">
          Go back home
        </Button>
      </div>
    </div>
  );
}
