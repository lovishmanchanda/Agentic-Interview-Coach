/**
 * Central API client (architecture.md §3.4). Every backend call goes through here.
 *
 * - Unwraps the { success, data, error, meta } envelope and throws ApiError on failure.
 * - Sends the bearer token; on an expired/invalid access token it refreshes once (single flight
 *   shared by concurrent requests) and retries. If refresh fails the session is cleared.
 */
import { useAuthStore } from "@/store/authStore";
import type {
  AuthResponse, InterviewConfigRequest, LoginRequest, MeOut, MentorWelcome, PlanSummary, ProfileCreate, ProfileOut,
  ProfileUpdate, RegisterRequest, ReportSummary, SessionSummary, TokenPair, ValidationErrorItem,
} from "@/types/models";

export const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

type ApiErrorInit = { status: number; code: string; message: string; details?: unknown; requestId?: string | null };

export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  requestId?: string | null;

  constructor({ status, code, message, details, requestId }: ApiErrorInit) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
  }
}

const REFRESHABLE_CODES = new Set(["token_expired", "invalid_token"]);
let refreshInFlight: Promise<string> | null = null;

type Method = "GET" | "POST" | "PUT" | "DELETE";
type RawOptions = { method?: Method; body?: unknown; token?: string | null; cookie?: boolean };

/** The { success, data, error, meta } envelope every endpoint answers with. */
type Envelope<T> = { success: boolean; data: T; error?: { code?: string; message?: string; details?: unknown } | null;
  meta?: { request_id?: string | null } };

async function rawRequest<T>(path: string, { method = "GET", body, token, cookie = false }: RawOptions = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        // Cookie mode: the API keeps the refresh token in an httpOnly cookie scoped to /api/v1/auth.
        ...(cookie ? { "X-Auth-Mode": "cookie" } : {}),
      },
      ...(cookie ? { credentials: "include" } : {}),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError({ status: 0, code: "network_error", message: "Can't reach the server. Check your connection and try again." });
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    // non-JSON body (proxy error page etc.)
  }

  if (!response.ok || payload?.success === false) {
    const error = payload?.error || {};
    throw new ApiError({
      status: response.status,
      code: error.code || `http_${response.status}`,
      message: error.message || "Something went wrong. Please try again.",
      details: error.details,
      requestId: payload?.meta?.request_id,
    });
  }
  return payload?.data as T;
}

/** A token another tab just got (it reached this tab over the auth BroadcastChannel), if good for 30 s more. */
function tokenFromOtherTab(staleToken: string | null): string | null {
  try {
    const token = useAuthStore.getState().accessToken;
    if (!token || token === staleToken) return null;
    const { exp } = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return exp * 1000 > Date.now() + 30_000 ? token : null;
  } catch {
    return null;
  }
}

/**
 * Tabs share one refresh cookie, and each refresh token works once: if two tabs refreshed together, the
 * server would see a reused token, treat it as stolen and end every session. So refreshes run one tab at a
 * time (Web Locks), and a tab that waited uses the token the other tab just got instead of refreshing again.
 */
function refreshTokens(staleToken: string | null): Promise<string> {
  const run = async (): Promise<string> => {
    const shared = tokenFromOtherTab(staleToken);
    if (!shared) return refreshWithCookie();
    return shared;
  };
  return typeof navigator !== "undefined" && navigator.locks ? navigator.locks.request("aic-token-refresh", run) : run();
}

/**
 * After a reload the access token is gone (it lives in memory only); get a fresh one from the refresh cookie.
 * Resolves with the token; rejects with session_expired (signed out) or a network error (session kept).
 */
export function restoreSession(): Promise<string> {
  refreshInFlight ??= refreshTokens(null).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function refreshWithCookie(): Promise<string> {
  const { setTokens, clear } = useAuthStore.getState();
  try {
    // No token in the body: the browser sends the httpOnly refresh cookie.
    const tokens = await rawRequest<TokenPair>("/api/v1/auth/refresh", { method: "POST", cookie: true });
    setTokens(tokens);
    return tokens.access_token;
  } catch (error) {
    // Offline, or the server is down or restarting: the session may still be good, so keep it.
    if (error instanceof ApiError && (error.status === 0 || error.status >= 500)) throw error;
    clear();
    throw new ApiError({ status: 401, code: "session_expired", message: "Your session has ended. Please sign in again." });
  }
}

type RequestOptions = { method?: Method; body?: unknown; auth?: boolean; cookie?: boolean };

export async function request<T = unknown>(path: string, { method, body, auth = true, cookie = false }: RequestOptions = {}): Promise<T> {
  const token: string | null | undefined = auth ? useAuthStore.getState().accessToken : undefined;
  try {
    return await rawRequest<T>(path, { method, body, token, cookie });
  } catch (error) {
    if (!auth || !(error instanceof ApiError) || error.status !== 401 || !REFRESHABLE_CODES.has(error.code)) {
      throw error;
    }
    refreshInFlight ??= refreshTokens(token ?? null).finally(() => {
      refreshInFlight = null;
    });
    const newToken = await refreshInFlight;
    return rawRequest<T>(path, { method, body, token: newToken });
  }
}

// Endpoints whose responses are typed (types/api.d.ts) say so; the rest are `unknown` until the backend
// documents them (app/api/v1/response_models.py), then they get a type here too.
type CodeRun = { code: string; language: string };
type Prepare = { company: string; jdText?: string; weeks?: number; conversationId?: string };

export const api = {
  health: () => request("/api/v1/health", { auth: false }),
  auth: {
    register: (data: RegisterRequest) =>
      request<AuthResponse>("/api/v1/auth/register", { method: "POST", body: data, auth: false, cookie: true }),
    login: (data: LoginRequest) =>
      request<AuthResponse>("/api/v1/auth/login", { method: "POST", body: data, auth: false, cookie: true }),
    logout: () => request<null>("/api/v1/auth/logout", { method: "POST", auth: false, cookie: true }),
  },
  users: {
    me: () => request<MeOut>("/api/v1/users/me"),
  },
  profile: {
    get: () => request<ProfileOut>("/api/v1/profiles/me"),
    create: (data: ProfileCreate) => request<ProfileOut>("/api/v1/profiles", { method: "POST", body: data }),
    update: (data: ProfileUpdate) => request<ProfileOut>("/api/v1/profiles/me", { method: "PUT", body: data }),
  },
  interviews: {
    create: (data: Partial<InterviewConfigRequest> = {}) =>
      request<SessionSummary>("/api/v1/interviews", { method: "POST", body: data }),
    options: ({ role, interviewType }: { role?: string; interviewType?: string } = {}) => {
      const params = new URLSearchParams();
      if (role) params.set("role", role);
      if (interviewType) params.set("interview_type", interviewType);
      return request(`/api/v1/interviews/options${params.size ? `?${params}` : ""}`);
    },
    list: () => request<SessionSummary[]>("/api/v1/interviews"),
    get: (sessionId: string) => request(`/api/v1/interviews/${encodeURIComponent(sessionId)}`),
    // A practice run of the current coding problem's visible tests. Not recorded; Submit goes over the socket.
    runCode: (sessionId: string, { code, language }: CodeRun) =>
      request(`/api/v1/interviews/${encodeURIComponent(sessionId)}/code/run`, { method: "POST", body: { code, language } }),
  },
  // Admin dashboard (Phase 6): admins only (the admin role or ADMIN_EMAILS on the server).
  admin: {
    metrics: () => request("/api/v1/admin/metrics"),
    usage: (days = 7) => request(`/api/v1/admin/usage?days=${days}`),
    prompts: () => request("/api/v1/admin/prompts"),
    setPrompt: (name: string, weights: Record<string, number>) =>
      request(`/api/v1/admin/prompts/${name}`, { method: "PUT", body: { weights } }),
    resetPrompt: (name: string) => request(`/api/v1/admin/prompts/${name}`, { method: "DELETE" }),
    llmCalls: (params: Record<string, string> = {}) => request(`/api/v1/admin/llm-calls?${new URLSearchParams(params)}`),
    // Real visitors' Core Web Vitals (p75 per page) and browser errors, from the telemetry endpoint.
    clientHealth: (days = 7) => request(`/api/v1/admin/client-health?days=${days}`),
  },
  prep: {
    plans: () => request<PlanSummary[]>("/api/v1/prep/plans"), // newest first
  },
  reports: {
    list: () => request<ReportSummary[]>("/api/v1/reports"), // newest first
    get: (reportId: string) => request(`/api/v1/reports/${encodeURIComponent(reportId)}`),
  },
  mentor: {
    // No conversationId: starts a new conversation. The server keeps the history.
    send: (message: string, conversationId?: string) =>
      request("/api/v1/mentor/message", { method: "POST", body: { message, ...(conversationId ? { conversation_id: conversationId } : {}) } }),
    // Company preparation (Phase 3): research + optional job description + your history -> a plan in the chat.
    prepare: ({ company, jdText, weeks, conversationId }: Prepare) =>
      request("/api/v1/mentor/prepare", {
        method: "POST",
        body: { company, ...(jdText ? { jd_text: jdText } : {}), ...(weeks ? { weeks } : {}),
          ...(conversationId ? { conversation_id: conversationId } : {}) },
      }),
    welcome: () => request<MentorWelcome>("/api/v1/mentor/welcome"),
    conversations: () => request("/api/v1/mentor/conversations"),
    conversation: (id: string) => request(`/api/v1/mentor/conversations/${encodeURIComponent(id)}`),
  },
};

/** ws(s)://host for the backend, derived from API_URL. */
export const WS_URL = API_URL.replace(/^http/, "ws");

/** Turns a 422 envelope into { fieldPath: message } for inline form errors. */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== "validation_error" || !Array.isArray(error.details)) return {};
  return Object.fromEntries(
    (error.details as ValidationErrorItem[]).map((d) => [d.loc.filter((p) => p !== "body").join("."), d.msg.replace(/^Value error, /, "")]),
  );
}
