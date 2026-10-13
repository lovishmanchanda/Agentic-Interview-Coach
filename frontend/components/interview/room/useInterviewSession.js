"use client";

import { useEffect, useReducer, useRef } from "react";

import { initialSession, isWaiting, sessionReducer } from "@/lib/interviewSession";
import { connectInterview } from "@/lib/interviewSocket";
import { refreshAfterInterview } from "@/lib/queries";
import { useShellStore } from "@/store/shellStore";

/**
 * The live interview: the socket, wired to the session reducer (lib/interviewSession.ts, where every transition
 * lives and is tested). Side effects stay here: the clock, restoring an autosaved answer, refreshing your data
 * when the interview ends.
 *
 *   onDraftRestored(text)  the server kept an answer you were typing (reload, dropped connection)
 *
 * Returns the session state plus the things you can do: send an answer, code, a hint request or a draft.
 * Each send returns false (and says so in `error`) when the socket isn't connected.
 */
export default function useInterviewSession(sessionId, { onDraftRestored } = {}) {
  const [session, dispatch] = useReducer(sessionReducer, initialSession);
  const socket = useRef(null);
  const restored = useRef(onDraftRestored);
  useEffect(() => {
    restored.current = onDraftRestored;
  });

  useEffect(() => {
    const ws = connectInterview(sessionId, {
      onStatus: (kind, message) => dispatch({ type: "status", kind, message }),
      onEvent: (event) => {
        dispatch({ type: "event", event, receivedAt: Date.now() });
        if (event.type === "SESSION_SNAPSHOT" && event.payload?.draft_answer) restored.current?.(event.payload.draft_answer);
        if (event.type === "INTERVIEW_COMPLETE") {
          // Your reports, sessions and what ARIA knows have changed: refresh the cache and the status line.
          refreshAfterInterview();
          useShellStore.getState().load({ force: true });
        }
      },
    });
    socket.current = ws;
    return () => ws.close();
  }, [sessionId]);

  const send = (message, onSent) => {
    if (socket.current?.send(message)) {
      onSent?.();
      return true;
    }
    dispatch({ type: "localError", message: "Not connected yet. Wait a moment and try again." });
    return false;
  };

  return {
    ...session,
    waiting: isWaiting(session),
    sendAnswer: (text) => send({ type: "ANSWER", answer_text: text }, () => dispatch({ type: "answerSent", text })),
    sendCode: ({ code, language, explanation }) => send({ type: "CODE_SUBMIT", code, language, explanation },
      () => dispatch({ type: "codeSent", code, language, explanation })),
    requestHint: (draft) => send({ type: "HINT_REQUEST", draft_text: draft }, () => dispatch({ type: "hintRequested" })),
    // Draft autosave is best effort: no error when it can't go.
    sendDraft: (text) => Boolean(socket.current?.send({ type: "ANSWER_DRAFT", answer_text: text })),
    clearError: () => dispatch({ type: "localError", message: null }),
    reconnect: () => socket.current?.reconnect(),
    socketRef: socket,
  };
}
