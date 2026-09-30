"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ChartIcon, LogoutIcon, UserIcon } from "@/components/ui/icons";
import { signOut } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";

function initials(name = "") {
  return name.split(" ").filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "·";
}

/**
 * The avatar button and its menu: who you are, Profile, Admin (admins only) and Sign out. Closes on Escape,
 * on a click outside, and after choosing. Sign out returns you to the landing page (the room plays the move
 * from your desk back to the chair).
 */
export default function UserMenu() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const root = useRef(null);

  useEffect(() => {
    router.prefetch("/"); // the landing page is ready the moment you sign out
  }, [router]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    const onClick = (e) => !root.current?.contains(e.target) && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onClick);
    };
  }, [open]);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/");
  }

  const itemClass = "flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-muted transition-colors hover:bg-raised hover:text-foreground";
  return (
    <div ref={root} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu"
        className="flex items-center gap-2.5 rounded-full border border-border bg-raised/60 py-1 pl-1 pr-3 transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-border-strong to-surface font-mono text-xs font-semibold">
          {initials(user?.name)}
        </span>
        <span className="hidden max-w-32 truncate text-sm sm:block">{user?.name?.split(" ")[0]}</span>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div role="menu" initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }} transition={{ duration: 0.18 }}
            className="absolute right-0 top-full z-50 mt-2 w-64 origin-top-right rounded-2xl border border-border-strong bg-surface/95 p-2 shadow-2xl backdrop-blur-xl">
            <div className="px-3 py-2">
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs text-muted">{user?.email}</p>
            </div>
            <div className="my-1 h-px bg-border" />
            <Link role="menuitem" href="/profile" onClick={() => setOpen(false)} className={itemClass}><UserIcon className="size-4" />Profile</Link>
            {user?.is_admin && (
              <Link role="menuitem" href="/admin" onClick={() => setOpen(false)} className={itemClass}><ChartIcon className="size-4" />Admin</Link>
            )}
            <div className="my-1 h-px bg-border" />
            <button type="button" role="menuitem" onClick={handleSignOut} disabled={signingOut} className={itemClass}>
              <LogoutIcon className="size-4" />{signingOut ? "Signing out…" : "Sign out"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
