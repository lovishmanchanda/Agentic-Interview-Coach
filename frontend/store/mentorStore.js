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
  pendingKind: null,          // "prep" while a preparation plan is being built (the room shows its steps)
  error: null,
  failedMessage: null,        // kept so "Try again" can resend it
  failedPrepare: null,        // {company, jdText, weeks} of a failed preparation request, for "Try again"
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
    set({ activeId: id, messages: [], conversationStatus: "loading", error: null, failedMessage: null, failedPrepare: null, view });
    try {
      const conversation = await api.mentor.conversation(id);
      if (get().view === view) set({ messages: conversation.messages, conversationStatus: "ready" });
    } catch (error) {
      if (get().view === view) set({ conversationStatus: "error", error });
    }
  },

  newConversation: () => {
    if (get().activeId === null && get().conversationStatus === "idle") return;
    set((s) => ({ activeId: null, messages: [], conversationStatus: "idle", error: null, failedMessage: null, failedPrepare: null,
      view: s.view + 1 }));
  },

  /** Returns the conversation id on success, null on failure (the error is in the store). */
  send: (text) => {
    const message = text.trim();
    // "Prepare me for Google" runs the company-prep steps on the server; show them while it works.
    const kind = /\b(?:[Pp]rep(?:are)?|[Gg]et ready|ready|[Pp]lan)\b.*\b(?:for|at|with)\s+[A-Z]/.test(message) ? "prep" : null;
    return get()._post(message, kind, (activeId) => api.mentor.send(message, activeId), { failedMessage: message });
  },

  prepare: ({ company, jdText, weeks }) => {
    const label = `Prepare me for ${company.trim()}${jdText ? " (with a job description)" : ""}`;
    return get()._post(label, "prep",
      (activeId) => api.mentor.prepare({ company: company.trim(), jdText, weeks, conversationId: activeId }),
      { failedPrepare: { company, jdText, weeks } });
  },

  /** The shared request path: optimistic user message, the call, then the reply (or the error and what to retry). */
  _post: async (message, kind, call, retry) => {
    const { sending, activeId, view } = get();
    if (!message || sending) return null;
    const optimistic = { message_id: `local-${Date.now()}`, role: "user", content: message, pending: true };
    set((s) => ({ messages: [...s.messages, optimistic], sending: true, pendingKind: kind, error: null,
      failedMessage: null, failedPrepare: null }));
    try {
      const reply = await call(activeId);
      if (get().view === view) {
        set((s) => ({
          activeId: reply.conversation_id,
          messages: [...s.messages.filter((m) => m !== optimistic), ...reply.messages],
          conversationStatus: "ready",
          sending: false,
          pendingKind: null,
        }));
      } else {
        set({ sending: false, pendingKind: null }); // the candidate moved to another conversation; the reply is saved there
      }
      get().loadConversations();
      return reply.conversation_id;
    } catch (error) {
      if (get().view === view) {
        set((s) => ({ messages: s.messages.filter((m) => m !== optimistic), sending: false, pendingKind: null, error,
          failedMessage: null, failedPrepare: null, ...retry }));
      } else {
        set({ sending: false, pendingKind: null });
      }
      return null;
    }
  },

  reset: () => set(INITIAL),
}));
