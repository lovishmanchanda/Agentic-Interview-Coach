import Button from "@/components/ui/Button";

export const metadata = { title: "Page not found" };

/** Any URL that doesn't match a route: an empty room, lit by a single light. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-5 text-center">
      <div aria-hidden="true"
        className="absolute inset-x-0 top-0 mx-auto h-full w-[min(56rem,100%)] bg-[linear-gradient(to_bottom,rgb(230_236_245/0.08),transparent_70%)] [clip-path:polygon(45%_0,55%_0,100%_100%,0_100%)]" />
      <p className="relative font-serif text-[clamp(7rem,26vw,14rem)] italic leading-none tracking-[-0.04em] text-foreground/90">404</p>
      <h1 className="relative mt-2 text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">This room is empty.</h1>
      <p className="relative mt-3 max-w-sm text-muted">The link may be broken, or the page may have moved.</p>
      <div className="relative mt-9 flex flex-wrap justify-center gap-3">
        <Button href="/dashboard">Go to your desk</Button>
        <Button href="/" variant="secondary">Home</Button>
      </div>
    </main>
  );
}
