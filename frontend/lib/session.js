"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useMentorStore } from "@/store/mentorStore";
import { useProfileStore } from "@/store/profileStore";

export async function signOut() {
  const { clear } = useAuthStore.getState();
  try {
    await api.auth.logout(); // revokes the refresh token and clears its httpOnly cookie
  } catch {
    // Best effort: the local session is cleared regardless.
  }
  clear();
  clearUserData();
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
