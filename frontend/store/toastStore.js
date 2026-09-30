"use client";

import { create } from "zustand";

/**
 * Toasts: short notes for things that finished in the background ("Report ready", "Draft saved").
 * Call toast.success("…") from anywhere; <Toaster /> in the root layout shows them. Each goes after 5 s.
 */
let nextId = 1;

export const useToastStore = create((set, get) => ({
  toasts: [],
  push: (tone, message, { title, duration = 5000 } = {}) => {
    const id = nextId++;
    set({ toasts: [...get().toasts, { id, tone, message, title }].slice(-4) });
    if (duration) setTimeout(() => get().dismiss(id), duration);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export const toast = {
  success: (message, options) => useToastStore.getState().push("success", message, options),
  error: (message, options) => useToastStore.getState().push("error", message, options),
  info: (message, options) => useToastStore.getState().push("info", message, options),
};
