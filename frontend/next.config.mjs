/**
 * Security headers on every page, including a Content-Security-Policy: what the browser may load and run, so an
 * injected script has nowhere to come from and nowhere to send data.
 *
 *   scripts   this site and the Monaco editor's CDN only: nothing from anywhere else can run. Inline scripts are
 *             allowed because Next.js streams each page's data in inline <script> tags; refusing them needs a
 *             per-request nonce, which would turn every (static, CDN-cached) page into a server render on each
 *             visit. (Experimental SRI was tried: it hashes only some external scripts, not the inline ones.)
 *             The XSS surface that inline scripts would matter for is kept closed instead: React escapes all
 *             output, nothing uses dangerouslySetInnerHTML, and ARIA's markdown renders no raw HTML.
 *   connect   this site and the API (HTTP + WebSocket) only, so nothing can be sent anywhere else
 *   styles    inline allowed (animation libraries set styles inline; styles can't run code)
 *   framing   nobody (clickjacking); no plugins; no <base> rewrites; forms post to this site only
 *
 * Development also allows 'unsafe-eval' (React's dev tools and hot reload).
 */
const isDev = process.env.NODE_ENV === "development";
const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
const API_WS = API_URL.replace(/^http/, "ws");
const MONACO_CDN = "https://cdn.jsdelivr.net"; // the code editor (@monaco-editor/react's default loader)

const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${MONACO_CDN}${isDev ? " 'unsafe-eval'" : ""}`,
  `style-src 'self' 'unsafe-inline' ${MONACO_CDN}`,
  "img-src 'self' data: blob:",
  `font-src 'self' data: ${MONACO_CDN}`,
  `connect-src 'self' ${API_URL} ${API_WS}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP },
  { key: "X-Frame-Options", value: "DENY" }, // older browsers' version of frame-ancestors 'none'
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Microphone stays available to this site for voice interviews (Phase 5); camera and location are off.
  { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=(self)" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
