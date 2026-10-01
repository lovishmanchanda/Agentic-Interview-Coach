"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Auth session.
 * - The short-lived access token (30 min) lives in memory only, never in localStorage, so a script injected into
 *   the page (XSS) can't lift it from storage. A reload starts without it and gets a fresh one from the refresh
 *   cookie (`restoreSession` in lib/api.js).
 * - The long-lived refresh token is never visible to page scripts at all: the API keeps it in an httpOnly cookie.
 * - Only `user` (name, email, roles: what the UI shows) is kept in localStorage, so the app knows someone is
 *   signed in and can restore the session silently.
 * - Tabs keep each other in step over a BroadcastChannel: a sign-in, a refreshed token or a sign-out in one tab
 *   reaches the others at once (tokens travel between tabs of this site only, never through storage).
 */
const CHANNEL = "aic-auth";
const LEGACY_KEY = "aic-auth"; // older builds persisted the access token here; removed on load

let channel = null;
function broadcast(message) {
  try {
    channel?.postMessage(message);
  } catch {
    // a closed channel (page unloading): nothing to tell
  }
}

export const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null, // memory only (see partialize)
      hasHydrated: false,

      setSession: ({ user, tokens }) => {
        set({ user, accessToken: tokens.access_token });
        broadcast({ type: "session", user, accessToken: tokens.access_token });
      },
      setTokens: (tokens) => {
        set({ accessToken: tokens.access_token });
        broadcast({ type: "tokens", accessToken: tokens.access_token });
      },
      setUser: (user) => set({ user }),
      clear: () => {
        set({ user: null, accessToken: null });
        broadcast({ type: "signout" });
      },
      markHydrated: () => set({ hasHydrated: true }),
    }),
    {
      name: "aic-user",
      // window.localStorage throws on the server, so persistence is skipped during prerender.
      storage: createJSONStorage(() => window.localStorage),
      partialize: ({ user }) => ({ user }),
      // localStorage is synchronous, so this can run inside create() before `useAuthStore` is
      // assigned. Use the state's own action rather than referencing the store variable.
      onRehydrateStorage: () => (state) => state?.markHydrated(),
    },
  ),
);

if (typeof window !== "undefined") {
  try {
    window.localStorage.removeItem(LEGACY_KEY);
  } catch {
    // storage blocked: nothing was saved there either
  }
  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = ({ data }) => {
      // Applied with setState (not the actions) so a received message isn't broadcast again.
      if (data?.type === "session") useAuthStore.setState({ user: data.user, accessToken: data.accessToken });
      if (data?.type === "tokens") useAuthStore.setState({ accessToken: data.accessToken });
      if (data?.type === "signout") useAuthStore.setState({ user: null, accessToken: null });
    };
  }
  // The user record is still in localStorage, so a sign-in/out in a tab without BroadcastChannel reaches others.
  window.addEventListener("storage", (event) => {
    if (event.key === "aic-user" || event.key === null) useAuthStore.persist.rehydrate();
  });
}
