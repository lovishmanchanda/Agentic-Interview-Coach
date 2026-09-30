"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Per-browser interface preferences (not account data): whether the sidebar is collapsed to an icon rail.
 * Kept in localStorage; if storage is unavailable the defaults simply apply.
 */
const safeStorage = createJSONStorage(() => {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
});

export const useUiStore = create(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      paletteOpen: false,
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
    }),
    { name: "aic-ui", storage: safeStorage, partialize: ({ sidebarCollapsed }) => ({ sidebarCollapsed }) },
  ),
);
