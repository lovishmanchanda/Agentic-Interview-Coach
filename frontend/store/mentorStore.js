"use client";

import { create } from "zustand";

import { api } from "@/lib/api";

const INITIAL = {
  welcome: null,              // GET /mentor/welcome: report count, latest report, whether the Mentor is on
  welcomeError: null,
  conversations: null,        // the sidebar list, newest first (null until loaded)
  activeId: null,             // null = a new conversation (created by the server on its first reply)
  messages: [],
  conversationStatus: "idle", // idle | loading | ready | error
  sending: false,
  error: null,
  failedMessage: null,        // kept so "Try again" can resend it
  view: 0,                    // bumped when the open conversation changes, to drop replies meant for another one
};

/** Mentor chat state (implementation_plan.md 2.6). The URL (?c=<id>) says which conversation is open. */
export const useMentorStore = create((set, get) => ({
  ...INITIAL,

  loadWelcome: async () => {
    try {
      set({ welcome: await api.mentor.welcome(), welcomeError: null });
    } catch (error) {
      set({ welcomeError: error });
    }
  },

  loadConversations: async () => {
    try {
      set({ conversations: await api.mentor.conversations() });
    } catch {
      set((s) => ({ conversations: s.conversations ?? [] })); // the chat still works without the list
    }
  },

  openConversation: async (id) => {
    const { activeId, conversationStatus } = get();
    if (activeId === id && (conversationStatus === "ready" || conversationStatus === "loading")) return;
    const view = get().view + 1;
    set({ activeId: id, messages: [], conversationStatus: "loading", error: null, failedMessage: null, view });
    try {
      const conversation = await api.mentor.conversation(id);
      if (get().view === view) set({ messages: conversation.messages, conversationStatus: "ready" });
    } catch (error) {
      if (get().view === view) set({ conversationStatus: "error", error });
    }
  },

  newConversation: () => {
    if (get().activeId === null && get().conversationStatus === "idle") return;
    set((s) => ({ activeId: null, messages: [], conversationStatus: "idle", error: null, failedMessage: null, view: s.view + 1 }));
  },

  /** Returns the conversation id on success, null on failure (the error is in the store). */
  send: async (text) => {
    const message = text.trim();
    const { sending, activeId, view } = get();
    if (!message || sending) return null;
    const optimistic = { message_id: `local-${Date.now()}`, role: "user", content: message, pending: true };
    set((s) => ({ messages: [...s.messages, optimistic], sending: true, error: null, failedMessage: null }));
    try {
      const reply = await api.mentor.send(message, activeId);
      if (get().view === view) {
        set((s) => ({
          activeId: reply.conversation_id,
          messages: [...s.messages.filter((m) => m !== optimistic), ...reply.messages],
          conversationStatus: "ready",
          sending: false,
        }));
      } else {
        set({ sending: false }); // the candidate moved to another conversation; the reply is saved there
      }
      get().loadConversations();
      return reply.conversation_id;
    } catch (error) {
      if (get().view === view) {
        set((s) => ({ messages: s.messages.filter((m) => m !== optimistic), sending: false, error, failedMessage: message }));
      } else {
        set({ sending: false });
      }
      return null;
    }
  },

  reset: () => set(INITIAL),
}));
