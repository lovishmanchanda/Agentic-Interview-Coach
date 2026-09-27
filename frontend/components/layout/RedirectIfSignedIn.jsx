"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

import { useAuthStore } from "@/store/authStore";

/**
 * Sends users who were already signed in when the page loaded from /login and /register to the
 * dashboard. Checked once at hydration only, so it never races the forms' own post-login redirect.
 */
export default function RedirectIfSignedIn() {
  const router = useRouter();
  const hasHydrated = useAuthStore((s) => s.hasHydrated);

  useEffect(() => {
    if (hasHydrated && useAuthStore.getState().accessToken) router.replace("/dashboard");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally once, when hydration completes
  }, [hasHydrated]);

  return null;
}
