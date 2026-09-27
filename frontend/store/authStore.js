"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Auth session. Persisted to localStorage so a reload keeps you signed in.
 * Trade-off: tokens in localStorage are readable by any script on the page, so XSS must be
 * prevented (never render untrusted HTML). Moving the refresh token to an httpOnly cookie is a
 * later hardening step (architecture.md §12.1, "httpOnly cookie optional").
 */
export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      hasHydrated: false,

      setSession: ({ user, tokens }) =>
        set({ user, accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
      setTokens: (tokens) => set({ accessToken: tokens.access_token, refreshToken: tokens.refresh_token }),
      setUser: (user) => set({ user }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "aic-auth",
      // window.localStorage throws on the server, so persistence is skipped during prerender.
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ user, accessToken, refreshToken }) => ({ user, accessToken, refreshToken }),
      // localStorage is synchronous, so this can run inside create() before `useAuthStore` is
      // assigned. Use the state's own action rather than referencing the store variable.
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);
