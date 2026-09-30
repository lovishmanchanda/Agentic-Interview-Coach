"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useMentorStore } from "@/store/mentorStore";
import { useProfileStore } from "@/store/profileStore";

// True while a deliberate sign-out is finishing, so AuthGuard doesn't treat the cleared session as an expired
// one and bounce you to /login: the caller sends you to the landing page instead.
let signingOut = false;
export const isSigningOut = () => signingOut;

export async function signOut() {
  const { clear } = useAuthStore.getState();
  signingOut = true;
  try {
    await api.auth.logout(); // revokes the refresh token and clears its httpOnly cookie
  } catch {
    // Best effort: the local session is cleared regardless.
  }
  clear();
  clearUserData();
  setTimeout(() => {
    signingOut = false;
  }, 3000);
}

/** Drops the signed-in user's cached data, so the next account to sign in on this tab never sees it. */
export function clearUserData() {
  useProfileStore.getState().reset();
  useMentorStore.getState().reset();
}

/** Only allow same-site relative paths as post-login redirects (no open redirects, no javascript: URLs). */
export function safeNextPath(next, fallback = "/dashboard") {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
