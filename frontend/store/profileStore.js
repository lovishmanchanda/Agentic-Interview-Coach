"use client";

import { create } from "zustand";

import { api, ApiError } from "@/lib/api";

/** status: idle | loading | ready | missing | error */
export const useProfileStore = create((set, get) => ({
  profile: null,
  status: "idle",
  error: null,

  load: async ({ force = false } = {}) => {
    const { status } = get();
    if (!force && (status === "loading" || status === "ready")) return get().profile;
    set({ status: "loading", error: null });
    try {
      const profile = await api.profile.get();
      set({ profile, status: "ready" });
      return profile;
    } catch (error) {
      if (error instanceof ApiError && error.code === "profile_missing") {
        set({ profile: null, status: "missing" });
        return null;
      }
      set({ status: "error", error });
      throw error;
    }
  },

  save: async (data) => {
    const profile = get().profile ? await api.profile.update(data) : await api.profile.create(data);
    set({ profile, status: "ready", error: null });
    return profile;
  },

  reset: () => set({ profile: null, status: "idle", error: null }),
}));
