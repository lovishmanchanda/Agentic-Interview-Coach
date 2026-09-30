"use client";

import { useEffect } from "react";

import Button from "@/components/ui/Button";
import { AlertIcon } from "@/components/ui/icons";

/**
 * The body of the error pages (app/error.js, app/(app)/error.js). Shows a plain message, never the error's
 * text: in production Next.js replaces server errors with a digest, and client errors can carry internals.
 */
export default function ErrorState({ error, retry, homeHref = "/" }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="relative mx-auto flex max-w-lg flex-col items-center py-20 text-center">
      <div aria-hidden="true" className="pointer-events-none absolute -top-10 h-72 w-[30rem] max-w-[100vw] bg-[radial-gradient(closest-side,rgb(229_77_132/0.1),transparent)]" />
      <span className="relative flex size-14 items-center justify-center rounded-full border border-danger/30 bg-danger-soft text-danger">
        <AlertIcon className="size-6" />
      </span>
      <p className="eyebrow mt-6">Something went wrong</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.04em]">
        The lights <span className="font-serif font-normal italic tracking-[-0.02em]">flickered.</span>
      </h1>
      <p className="mt-4 text-muted">Your data is safe. Try again, and if it keeps happening, reload the page.</p>
      {error?.digest && <p className="mt-2 font-mono text-xs text-subtle">Reference {error.digest}</p>}
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={() => retry()}>Try again</Button>
        <Button href={homeHref} variant="secondary">Go back</Button>
      </div>
    </div>
  );
}
