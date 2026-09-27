import Button from "@/components/ui/Button";

const LOOP = [
  { title: "Interview", body: "Adaptive technical, behavioral and live-coding interviews that respond to how you answer." },
  { title: "Evaluate", body: "Structured, multi-dimensional feedback on every answer, not just a single score." },
  { title: "Mentor", body: "Chat with a mentor that knows your interview history and cites the sessions it draws on." },
  { title: "Improve", body: "Drill your weakest topics and interview again. The loop closes on itself." },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">AI</span>
          <span className="font-semibold">Interview Coach</span>
        </div>
        <nav className="flex items-center gap-2">
          <Button href="/login" variant="ghost">
            Sign in
          </Button>
          <Button href="/register">Get started</Button>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-20 text-center md:py-28">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight md:text-6xl">Practise interviews with a coach that remembers.</h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted">
            Realistic mock interviews, honest structured feedback, and an AI mentor that turns your own reports into a plan.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button href="/register" size="lg">
              Create free account
            </Button>
            <Button href="/login" size="lg" variant="secondary">
              I have an account
            </Button>
          </div>
        </section>

        <section aria-labelledby="loop-heading" className="pb-24">
          <h2 id="loop-heading" className="sr-only">
            How it works
          </h2>
          <ol className="grid gap-4 md:grid-cols-4">
            {LOOP.map((step, index) => (
              <li key={step.title} className="rounded-xl border border-border bg-surface p-6">
                <span className="text-sm font-medium text-primary">0{index + 1}</span>
                <h3 className="mt-2 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>
    </div>
  );
}
