"use client";

import { AnimatePresence, motion, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";

import Logo from "@/components/brand/Logo";
import Button from "@/components/ui/Button";
import { useAuthStore } from "@/store/authStore";

const LINKS = [
  { href: "#loop", label: "How it works" },
  { href: "#agents", label: "VERA & ARIA" },
  { href: "#report", label: "Reports" },
  { href: "#faq", label: "FAQ" },
];
const EASE = [0.16, 1, 0.3, 1];

/** Phones: a full-screen menu with big links, closed by a link, the button or Escape. */
function MobileMenu({ open, onClose, signedIn }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div id="mobile-menu" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }}
          className="fixed inset-0 z-40 flex flex-col bg-background/95 px-6 pb-10 pt-24 backdrop-blur-xl md:hidden">
          <nav aria-label="Sections" className="flex flex-1 flex-col gap-2">
            {LINKS.map((l, i) => (
              <motion.a key={l.href} href={l.href} onClick={onClose}
                initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 + i * 0.06, duration: 0.5, ease: EASE }}
                className="border-b border-border py-4 text-3xl font-semibold tracking-tight">
                {l.label}
              </motion.a>
            ))}
          </nav>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }} className="grid gap-3">
            {signedIn ? (
              <Button href="/dashboard" size="lg" onClick={onClose}>Go to your desk</Button>
            ) : (
              <>
                <Button href="/register" size="lg" onClick={onClose}>Take the seat</Button>
                <Button href="/login" size="lg" variant="secondary" onClick={onClose}>Sign in</Button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Transparent over the hero; a blurred glass bar once you scroll. Signed-in visitors get their desk. */
export default function SiteHeader() {
  const { scrollY } = useScroll();
  const [solid, setSolid] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const signedIn = useAuthStore((s) => s.hasHydrated && Boolean(s.accessToken));
  useMotionValueEvent(scrollY, "change", (y) => setSolid(y > 40));

  return (
    <>
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.4, ease: EASE }}
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          solid || menuOpen ? "border-b border-border/70 bg-background/70 backdrop-blur-xl" : "border-b border-transparent"
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6">
          <Link href="/" aria-label="InterviewOS home" onClick={() => setMenuOpen(false)}>
            <Logo />
          </Link>
          <nav aria-label="Sections" className="hidden items-center gap-8 text-sm text-muted md:flex">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="relative transition-colors after:absolute after:-bottom-1 after:left-0 after:h-px after:w-0 after:bg-primary after:transition-all after:duration-300 hover:text-foreground hover:after:w-full">
                {l.label}
              </a>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            {signedIn ? (
              <Button href="/dashboard" size="sm" className="max-sm:hidden">Go to your desk</Button>
            ) : (
              <>
                <Button href="/login" variant="ghost" size="sm" className="max-sm:hidden">Sign in</Button>
                <Button href="/register" size="sm">Take the seat</Button>
              </>
            )}
            <button type="button" onClick={() => setMenuOpen((o) => !o)} aria-expanded={menuOpen} aria-controls="mobile-menu"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              className="relative flex size-10 items-center justify-center rounded-lg border border-border md:hidden">
              <span className={`absolute h-px w-4 bg-foreground transition-transform duration-300 ${menuOpen ? "rotate-45" : "-translate-y-1"}`} />
              <span className={`absolute h-px w-4 bg-foreground transition-transform duration-300 ${menuOpen ? "-rotate-45" : "translate-y-1"}`} />
            </button>
          </div>
        </div>
      </motion.header>
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} signedIn={signedIn} />
    </>
  );
}
