"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { LogoMark } from "@/components/brand/Logo";
import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { restoreSession } from "@/lib/api";
import { clearUserData, isSigningOut } from "@/lib/session";
import { useAuthStore } from "@/store/authStore";
import { useProfileStore } from "@/store/profileStore";

const SETUP_PATH = "/profile/setup";

/**
 * Client-side route protection for the (app) group:
 * signed out -> /login?next=…, no profile yet -> the setup wizard, profile done -> never the wizard.
 * After a reload the access token is gone (it lives in memory only), so a remembered user is restored silently
 * from the refresh cookie first; only if that fails is the visitor sent to sign in.
 * The backend still enforces auth on every request; this only decides what to render.
 */
export default function AuthGuard({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const { status, load, error } = useProfileStore();
  const [offline, setOffline] = useState(false); // restoring failed for lack of a connection, not a session

  useEffect(() => {
    if (!hasHydrated || accessToken) return undefined;
    if (user && !isSigningOut()) {
      let current = true;
      restoreSession()
        .then(() => current && setOffline(false))
        .catch((err) => current && setOffline(err?.status === 0 || err?.status >= 500));
      return () => {
        current = false;
      };
    }
    // Also reached when the session ends without Sign out: it expired, or another tab signed out.
    clearUserData();
    if (!isSigningOut()) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    return undefined;
  }, [hasHydrated, accessToken, user, pathname, router]);

  useEffect(() => {
    if (accessToken) load().catch(() => {});
  }, [accessToken, load]);

  useEffect(() => {
    if (status === "missing" && pathname !== SETUP_PATH) router.replace(SETUP_PATH);
    if (status === "ready" && pathname === SETUP_PATH) router.replace("/dashboard");
  }, [status, pathname, router]);

  // Signing out: show nothing (the room behind stays) while the landing page takes over.
  if (!accessToken && isSigningOut()) return null;
  if (!accessToken && offline) {
    return (
      <div className="mx-auto mt-24 max-w-md space-y-4 px-4">
        <Alert tone="error" title="Can't reach the server">Check your connection, then try again. You&apos;re still signed in.</Alert>
        <Button onClick={() => { setOffline(false); restoreSession().catch((err) => setOffline(err?.status === 0 || err?.status >= 500)); }}>
          Try again
        </Button>
      </div>
    );
  }
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
