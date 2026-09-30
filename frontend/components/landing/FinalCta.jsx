"use client";

import Link from "next/link";

import Logo from "@/components/brand/Logo";
import Magnetic from "@/components/motion/Magnetic";
import Reveal from "@/components/motion/Reveal";
import SplitHeading from "@/components/motion/SplitHeading";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";

/** The last word, under a spotlight of its own, and the footer. */
export default function FinalCta() {
  const signedIn = useAuthStore((s) => s.hasHydrated && Boolean(s.accessToken));
  return (
    <>
      <section className="relative overflow-hidden px-5 py-28 sm:px-6 md:py-44" aria-labelledby="cta-title">
        <div aria-hidden="true"
          className="absolute inset-x-0 top-0 mx-auto h-full w-[min(70rem,100%)] bg-[linear-gradient(to_bottom,rgb(230_236_245/0.09),transparent_75%)] [clip-path:polygon(44%_0,56%_0,100%_100%,0_100%)]" />
        <div aria-hidden="true" className="absolute bottom-10 left-1/2 h-24 w-[40rem] max-w-full -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(230_236_245/0.1),transparent)]" />
        <Reveal className="relative mx-auto max-w-3xl text-center">
          <SplitHeading id="cta-title" text="The chair is *empty.*" className="text-[clamp(2.75rem,9vw,7rem)] font-semibold leading-[0.92] tracking-[-0.05em]" />
          <p className="mx-auto mt-6 max-w-md text-base text-muted sm:text-lg">VERA is ready when you are. Your report is on your desk the moment you finish.</p>
          <div className="mt-10 flex justify-center">
            <Magnetic>
              <Button href={signedIn ? "/interview/configure" : "/register"} size="lg" className="shadow-[0_0_48px_-8px_var(--primary)]">
                {signedIn ? "Start an interview" : "Take the seat"} <span aria-hidden="true">→</span>
              </Button>
            </Magnetic>
          </div>
        </Reveal>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-6 py-10 text-sm text-muted md:flex-row md:items-center">
          <Logo markClassName="size-7" />
          <nav aria-label="Footer" className="flex gap-6">
            <Link href="/login" className="hover:text-foreground">Sign in</Link>
            <Link href="/register" className="hover:text-foreground">Create account</Link>
            <a href="#faq" className="hover:text-foreground">FAQ</a>
          </nav>
          <p>© 2026 InterviewOS</p>
        </div>
      </footer>
    </>
  );
}
