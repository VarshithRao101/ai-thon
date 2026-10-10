import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/**
 * Browser security headers (D-056). The CSP allows only our own origin plus
 * what the app really loads: Monaco (code view) from cdn.jsdelivr.net, Google
 * profile photos, and Google's sign-in page as a form target. Nobody can frame
 * ZETA (clickjacking), and pages never sniff content types.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  "img-src 'self' data: blob: https:",
  `connect-src 'self'${isDev ? " ws: http://localhost:*" : ""} https://cdn.jsdelivr.net`,
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
  ...(isDev ? [] : ["upgrade-insecure-requests"]),
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
  ...(isDev
    ? []
    : [
        {
          key: "Strict-Transport-Security",
          value: "max-age=63072000; includeSubDomains; preload",
        },
      ]),
];

const nextConfig: NextConfig = {
  // Self-contained server bundle for the container image (deploy/docker).
  output: "standalone",
  poweredByHeader: false,
  // Workspace packages ship TypeScript source.
  transpilePackages: ["@flowledger/engine"],
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default nextConfig;
