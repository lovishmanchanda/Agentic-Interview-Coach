/**
 * Security headers on every page, including a Content-Security-Policy: where scripts, styles and data may be
 * loaded from, and where the page may send data.
 *
 *   scripts   from this site and the Monaco editor's CDN only: no script can be loaded from anywhere else.
 *             Inline scripts ARE allowed ('unsafe-inline'), so this policy does not stop an injected inline
 *             script: Next.js streams each page's data in inline <script> tags, and refusing inline scripts needs
 *             a per-request nonce, which would turn every static, CDN-cached page into a server render on each
 *             visit. (Experimental SRI was tried: it hashes only some external scripts, not the inline ones.)
 *             Injection is prevented in the code instead: React escapes all output, ARIA's markdown renders no
 *             raw HTML, and lint forbids dangerouslySetInnerHTML (eslint.config.mjs). Moving to nonces is the
 *             next step if third-party scripts or raw-HTML rendering are ever added.
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

const CSP = [ // a script that did run could still only talk to this site and the API (connect-src)
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
