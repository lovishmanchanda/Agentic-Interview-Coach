"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import PageTransition from "@/components/motion/PageTransition";
import { isFocusPage } from "@/lib/navigation";
import { useShellStore } from "@/store/shellStore";

import CommandPalette from "./CommandPalette";
import MobileTabBar from "./MobileTabBar";
import Sidebar from "./Sidebar";
import StatusBar from "./StatusBar";
import Topbar from "./Topbar";

/**
 * The signed-in app's frame (Phase 7.6):
 *   desktop  collapsible sidebar · glass top bar · page · status line
 *   phones   top bar · page · bottom tab bar
 *   anywhere ⌘K / Ctrl+K quick actions
 * The interview room itself is a focus page: no tab bar or status line competing with the question.
 */
export default function AppShell({ children }) {
  const pathname = usePathname();
  const focus = isFocusPage(pathname);
  const loadShell = useShellStore((s) => s.load);

  useEffect(() => {
    loadShell();
  }, [loadShell]);

  // First-time profile setup is a focused flow: no navigation until the profile exists.
  if (pathname === "/profile/setup") {
    return <main className="mx-auto max-w-2xl px-4 py-10 md:py-16">{children}</main>;
  }

  return (
    <div className="flex min-h-svh">
      {/* Printing (a report as PDF) keeps only the page: no navigation, status line or palette. */}
      <div className="contents print:hidden"><Sidebar /></div>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="contents print:hidden"><Topbar /></div>
        <main className={`mx-auto w-full max-w-5xl flex-1 px-4 pt-8 md:px-8 md:pb-10 ${focus ? "pb-8" : "pb-28"}`}>
          <PageTransition>{children}</PageTransition>
        </main>
        {!focus && <div className="contents print:hidden"><StatusBar /></div>}
      </div>
      <div className="contents print:hidden">
        {!focus && <MobileTabBar />}
        <CommandPalette />
      </div>
    </div>
  );
}
