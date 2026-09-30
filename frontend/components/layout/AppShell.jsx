"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";

import PageTransition from "@/components/motion/PageTransition";

import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function AppShell({ children }) {
  const pathname = usePathname();
  const [navOpen, setNavOpen] = useState(false);

  // First-time profile setup is a focused flow: no navigation until the profile exists.
  if (pathname === "/profile/setup") {
    return <main className="mx-auto max-w-2xl px-4 py-10 md:py-16">{children}</main>;
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar open={navOpen} onNavigate={() => setNavOpen(false)} />
      {navOpen && (
        <button type="button" aria-label="Close navigation" className="fixed inset-0 z-30 bg-black/30 md:hidden" onClick={() => setNavOpen(false)} />
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onMenu={() => setNavOpen(true)} />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 md:px-8">
          <PageTransition>{children}</PageTransition>
        </main>
      </div>
    </div>
  );
}
