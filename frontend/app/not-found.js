import Button from "@/components/ui/Button";

export const metadata = { title: "Page not found" };

/** Any URL that doesn't match a route. */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-4 text-center">
      <p className="text-sm font-medium text-primary">404</p>
      <h1 className="mt-2 text-2xl font-semibold">Page not found</h1>
      <p className="mt-3 text-muted">The link may be broken, or the page may have moved.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button href="/dashboard">Go to dashboard</Button>
        <Button href="/" variant="secondary">
          Home
        </Button>
      </div>
    </main>
  );
}
