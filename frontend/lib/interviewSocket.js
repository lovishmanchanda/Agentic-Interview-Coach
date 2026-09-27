/**
 * Live interview WebSocket client (architecture.md §13).
 *
 * - Handshake: first message is {type:"AUTH", token}. The token never goes in the URL.
 * - Reconnects with backoff on unexpected drops; the server answers every connect with
 *   SESSION_SNAPSHOT, so the UI simply rebuilds from it.
 * - Before each (re)connect it makes a cheap authenticated REST call so an expired access token
 *   is refreshed by lib/api.js first.
 */
import { api, WS_URL } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const FATAL_CLOSE_CODES = new Set([4400, 4401, 4404]);
const MAX_RETRIES = 5;

export function connectInterview(sessionId, { onEvent, onStatus }) {
  let socket = null;
  let retries = 0;
  let closedByUs = false;
  let authRetried = false;
  let retryTimer = null;

  async function open() {
    onStatus?.("connecting");
    try {
      await api.interviews.get(sessionId); // refreshes the access token if needed
    } catch (error) {
      onStatus?.("failed", error.message);
      return;
    }
    const token = useAuthStore.getState().accessToken;
    socket = new WebSocket(`${WS_URL}/ws/interview/${encodeURIComponent(sessionId)}`);

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: "AUTH", token }));
      retries = 0;
      onStatus?.("open");
    };
    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data));
      } catch {
        // ignore malformed frames
      }
    };
    socket.onclose = (event) => {
      if (closedByUs) return;
      if (event.code === 4401 && !authRetried) {
        authRetried = true; // token expired between REST check and handshake: refresh once and retry
        open();
        return;
      }
      if (FATAL_CLOSE_CODES.has(event.code) || retries >= MAX_RETRIES) {
        onStatus?.("failed", event.reason || "Connection closed");
        return;
      }
      retries += 1;
      onStatus?.("reconnecting");
      retryTimer = setTimeout(open, Math.min(1000 * 2 ** (retries - 1), 8000));
    };
  }

  open();

  return {
    send(event) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(event));
      return true;
    },
    close() {
      closedByUs = true;
      clearTimeout(retryTimer);
      socket?.close(1000);
    },
  };
}
