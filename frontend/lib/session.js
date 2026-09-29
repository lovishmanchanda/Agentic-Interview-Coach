"use client";

import { api } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";
import { useMentorStore } from "@/store/mentorStore";
import { useProfileStore } from "@/store/profileStore";

export async function signOut() {
  const { refreshToken, clear } = useAuthStore.getState();
  if (refreshToken) {
    try {
      await api.auth.logout(refreshToken);
    } catch {
      // Best effort: the local session is cleared regardless.
    }
  }
  clear();
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
