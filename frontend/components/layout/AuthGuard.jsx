"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

import { LogoMark } from "@/components/brand/Logo";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { clearUserData, isSigningOut } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";
import { useProfileStore } from "@/store/profileStore";

const SETUP_PATH = "/profile/setup";

/**
 * Client-side route protection for the (app) group:
 * signed out -> /login?next=…, no profile yet -> the setup wizard, profile done -> never the wizard.
 * The backend still enforces auth on every request; this only decides what to render.
 */
export default function AuthGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { status, load, error } = useProfileStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (!accessToken) {
      // Also reached when the session ends without Sign out: it expired, or another tab signed out.
      clearUserData();
      if (!isSigningOut()) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    load().catch(() => {});
  }, [hasHydrated, accessToken, pathname, router, load]);

  useEffect(() => {
    if (status === "missing" && pathname !== SETUP_PATH) router.replace(SETUP_PATH);
    if (status === "ready" && pathname === SETUP_PATH) router.replace("/dashboard");
  }, [status, pathname, router]);

  // Signing out: show nothing (the room behind stays) while the landing page takes over.
  if (!accessToken && isSigningOut()) return null;
  if (!hasHydrated || !accessToken || status === "idle" || status === "loading") {
    return <FullPageSpinner />;
  }
  if (status === "error") {
    return (
      <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
        <Alert tone="error" title="Couldn't load your account">
          {error?.message || "Please try again."}
        </Alert>
        <Button onClick={() => load({ force: true }).catch(() => {})}>Retry</Button>
      </div>
    );
  }
  const onWrongPage = (status === "missing" && pathname !== SETUP_PATH) || (status === "ready" && pathname === SETUP_PATH);
  if (onWrongPage) return <FullPageSpinner />;
  return children;
}

/** While your account loads: the mark, breathing, over whatever room is behind. Rarely seen for long. */
function FullPageSpinner() {
  return (
    <div role="status" className="flex min-h-svh flex-col items-center justify-center gap-4">
      <span className="animate-breathe"><LogoMark className="size-12" /></span>
      <span className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">Opening your desk…</span>
    </div>
  );
}
