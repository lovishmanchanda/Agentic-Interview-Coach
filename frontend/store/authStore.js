"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Auth session. The short-lived access token (30 min) is persisted to localStorage so a reload keeps you signed
 * in. The long-lived refresh token is never visible to page scripts: the API keeps it in an httpOnly cookie
 * ("cookie mode", architecture.md §12.1), so an XSS bug can't steal a lasting session.
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      hasHydrated: false,

      setSession: ({ user, tokens }) => set({ user, accessToken: tokens.access_token }),
      setTokens: (tokens) => set({ accessToken: tokens.access_token }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "aic-auth",
      // window.localStorage throws on the server, so persistence is skipped during prerender.
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ user, accessToken }) => ({ user, accessToken }),
      // localStorage is synchronous, so this can run inside create() before `useAuthStore` is
      // assigned. Use the state's own action rather than referencing the store variable.
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);

// Keep tabs in step: signing in or out, or a refreshed token, in one tab reaches the others at once.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === "aic-auth" || event.key === null) useAuthStore.persist.rehydrate();
  });
}
