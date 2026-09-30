"use client";

import "./globals.css";

/**
 * Last resort: an error in the root layout itself. It replaces the whole document, so it brings its own
 * <html>/<body> and uses no app components (they may be what failed).
 */
export default function GlobalError({ retry }) {
  return (
    <html lang="en">
      <body className="flex min-h-screen items-center justify-center bg-background px-4 text-foreground antialiased">
        <title>Something went wrong · InterviewOS</title>
        <div role="alert" className="max-w-md text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="mt-3 text-muted">The app couldn&apos;t load. Your data is safe.</p>
          <div className="mt-8 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => retry()}
              className="h-10 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-hover"
            >
              Try again
            </button>
            {/* A full reload, not client navigation: the app's router may be the broken part. */}
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="h-10 rounded-lg border border-border px-4 text-sm font-medium"
            >
              Reload page
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
