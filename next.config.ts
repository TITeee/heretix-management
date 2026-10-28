import type { NextConfig } from "next";
import pkg from "./package.json";

const isDev = process.env.NODE_ENV === "development"

// Everything the console loads is its own: scripts, styles, fonts (next/font/local),
// images and API calls. Next.js inlines scripts and React writes style attributes,
// so both need 'unsafe-inline'; holding scripts to a per-request nonce instead would
// make every page render dynamically. What this does stop: scripts, frames and
// form posts from elsewhere, <base> rewriting, plugins, and this app in a frame.
// The dev server also evaluates code and talks to its HMR socket.
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self'${isDev ? " ws: wss:" : ""}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ")

// HSTS is left to the TLS reverse proxy in front: this app cannot tell whether it
// is reached over https, and HSTS sent for a self-signed certificate would leave
// no way past the browser's warning.
const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
]

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_VERSION: pkg.version,
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ]
  },
};

export default nextConfig;
