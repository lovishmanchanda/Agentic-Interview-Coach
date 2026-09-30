"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { LogoMark } from "@/components/brand/Logo";
import { SearchIcon } from "@/components/ui/icons";
import Kbd from "@/components/ui/Kbd";
import { pageTitle } from "@/lib/navigation";
import { useUiStore } from "@/store/uiStore";

import UserMenu from "./UserMenu";

/**
 * The glass bar above every app page: the page's name (the logo on phones, where there's no sidebar),
 * quick actions (⌘K), and your account menu.
 */
export default function Topbar() {
  const pathname = usePathname();
  const openPalette = useUiStore((s) => s.setPaletteOpen);
  const title = pageTitle(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border/60 bg-background/55 px-4 backdrop-blur-xl md:px-8">
      <Link href="/dashboard" aria-label="Your desk" className="md:hidden"><LogoMark className="size-8" /></Link>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p key={title} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2 }} className="flex-1 truncate text-sm font-medium text-muted">
          {title}
        </motion.p>
      </AnimatePresence>
      <button type="button" onClick={() => openPalette(true)} aria-label="Quick actions (Command or Control + K)"
        className="flex h-10 items-center gap-2 rounded-xl border border-border bg-raised/50 px-3 text-sm text-muted transition-colors hover:border-border-strong hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
        <SearchIcon className="size-4" />
        <span className="hidden lg:inline">Jump to…</span>
        <span className="hidden sm:flex sm:gap-1"><Kbd>⌘</Kbd><Kbd>K</Kbd></span>
      </button>
      <UserMenu />
    </header>
  );
}
