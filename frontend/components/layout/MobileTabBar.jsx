"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { NAV_ITEMS, isActive } from "@/lib/navigation";

/**
 * Phones: the main destinations as a bottom tab bar (thumb reach), with the active tab's pill sliding across.
 * Respects the home-indicator safe area. Admin lives in the account menu here.
 */
export default function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-40 border-t border-border/70 bg-background/80 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl md:hidden">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {NAV_ITEMS.map((item) => {
          const active = isActive(item, pathname);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined}
                className={`relative flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${active ? "text-foreground" : "text-muted"}`}>
                {active && (
                  <motion.span layoutId="tab-pill" transition={{ type: "spring", duration: 0.45, bounce: 0.2 }}
                    className="absolute inset-x-3 inset-y-1.5 rounded-2xl bg-primary-soft" />
                )}
                <item.Icon className={`relative size-5 ${active ? "text-primary" : ""}`} />
                <span className="relative">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
