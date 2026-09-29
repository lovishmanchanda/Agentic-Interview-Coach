/**
 * Security headers on every page. A full Content-Security-Policy (script nonces; the Monaco editor loads from
 * cdn.jsdelivr.net until it's self-hosted) is planned with the production frontend work.
 */
const SECURITY_HEADERS = [
  { key: "X-Frame-Options", value: "DENY" }, // no framing: blocks clickjacking
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
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
