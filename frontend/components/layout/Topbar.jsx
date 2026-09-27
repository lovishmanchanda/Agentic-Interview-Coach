"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import Button from "@/components/ui/Button";
import { signOut } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";

export default function Topbar({ onMenu }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-surface/90 px-4 backdrop-blur md:px-8">
      <button type="button" onClick={onMenu} className="rounded-lg p-2 text-muted hover:bg-surface-muted md:hidden" aria-label="Open navigation">
        <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>
      <div className="flex-1" />
      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-medium">{user?.name}</p>
          <p className="text-xs text-muted">{user?.email}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={handleSignOut} loading={signingOut}>
          Sign out
        </Button>
      </div>
    </header>
  );
}
