/**
 * Live interview WebSocket client (architecture.md §13).
 *
 * - Handshake: first message is {type:"AUTH", token}. The token never goes in the URL.
 * - The server answers every connect with SESSION_SNAPSHOT, so the UI simply rebuilds from it.
 * - Before each (re)connect it makes a cheap authenticated REST call so an expired access token is
 *   refreshed by lib/api.js first.
 * - Heartbeat: a PING every 25 s. If nothing comes back within 10 s the connection is treated as dead
 *   (laptop sleep, network switch, half-open TCP) and replaced.
 * - Reconnects with backoff (1 s → 15 s) for as long as the page is open. While the browser is offline it
 *   waits, and reconnects as soon as the network is back or the tab becomes visible again.
 */
import { api, WS_URL } from "@/lib/api";
import { useAuthStore } from "@/store/authStore";

const FATAL_CLOSE_CODES = new Set([4400, 4401, 4404, 4429]);
const HEARTBEAT_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const MAX_BACKOFF_MS = 15_000;

export function connectInterview(sessionId, { onEvent, onStatus }) {
  let socket = null;
  let attempt = 0;
  let closedByUs = false;
  let authRetried = false;
  let retryTimer = null;
  let heartbeatTimer = null;
  let deadlineTimer = null;

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
    clearTimeout(deadlineTimer);
  }

  function startHeartbeat(ws) {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "PING" }));
      clearTimeout(deadlineTimer);
      // Any message (PONG or otherwise) clears this; silence means the connection is gone.
      deadlineTimer = setTimeout(() => ws.close(4000, "heartbeat timeout"), HEARTBEAT_TIMEOUT_MS);
    }, HEARTBEAT_MS);
  }

  function scheduleReconnect() {
    clearTimeout(retryTimer);
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      onStatus?.("offline");
      return; // the "online" listener reconnects
    }
    attempt += 1;
    onStatus?.("reconnecting");
    retryTimer = setTimeout(open, Math.min(1000 * 2 ** (attempt - 1), MAX_BACKOFF_MS));
  }

  async function open() {
    clearTimeout(retryTimer);
    if (closedByUs) return;
    onStatus?.(attempt === 0 ? "connecting" : "reconnecting");
    try {
      await api.interviews.get(sessionId); // refreshes the access token if needed
    } catch (error) {
      if (error.status === 0) {
        scheduleReconnect(); // network error: keep trying
      } else {
        onStatus?.("failed", error.message);
      }
      return;
    }
    if (closedByUs) return;
    const token = useAuthStore.getState().accessToken;
    const ws = new WebSocket(`${WS_URL}/ws/interview/${encodeURIComponent(sessionId)}`);
    socket = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "AUTH", token }));
      onStatus?.("open");
      startHeartbeat(ws);
    };
    ws.onmessage = (message) => {
      clearTimeout(deadlineTimer);
      let evt;
      try {
        evt = JSON.parse(message.data);
      } catch {
        return; // ignore malformed frames
      }
      if (evt.type === "SESSION_SNAPSHOT") {
        attempt = 0;
        authRetried = false;
      }
      if (evt.type !== "PONG") onEvent(evt);
    };
    ws.onclose = (event) => {
      stopHeartbeat();
      if (closedByUs || ws !== socket) return;
      if (event.code === 4401 && !authRetried) {
        authRetried = true; // token expired between the REST check and the handshake: refresh once and retry
        open();
        return;
      }
      if (FATAL_CLOSE_CODES.has(event.code)) {
        onStatus?.("failed", event.reason || "Connection closed");
        return;
      }
      scheduleReconnect();
    };
  }

  function reconnectNow() {
    if (closedByUs || socket?.readyState === WebSocket.OPEN || socket?.readyState === WebSocket.CONNECTING) return;
    attempt = 0;
    open();
  }
  const onVisible = () => document.visibilityState === "visible" && reconnectNow();
  window.addEventListener("online", reconnectNow);
  document.addEventListener("visibilitychange", onVisible);

  open();

  return {
    send(event) {
      if (socket?.readyState !== WebSocket.OPEN) return false;
      socket.send(JSON.stringify(event));
      return true;
    },
    reconnect: reconnectNow,
    close() {
      closedByUs = true;
      clearTimeout(retryTimer);
      stopHeartbeat();
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisible);
      socket?.close(1000);
    },
  };
}
