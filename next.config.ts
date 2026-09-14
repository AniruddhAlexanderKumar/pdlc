import type { NextConfig } from "next";

/**
 * Security headers applied to every response.
 *
 * `Content-Security-Policy` here is honest, not aspirational: `script-src`
 * and `style-src` both need `'unsafe-inline'`. `script-src` because Next.js's
 * App Router injects its hydration payload as inline `<script>` tags with no
 * nonce wired up (a nonce-based CSP is possible with Next but requires
 * threading a per-request nonce through `middleware.ts` and every layout —
 * a real architecture change, not a header tweak, and out of scope here).
 * `style-src` because Radix UI (`@radix-ui/react-dialog`, already a
 * dependency) sets inline `style` attributes on portalled elements for
 * positioning. Removing either directive would break real application
 * behavior, which is explicitly not the trade this makes. Everything else
 * in the policy is as strict as the application actually allows.
 *
 * `frame-ancestors 'none'` is the CSP-native clickjacking defense;
 * `X-Frame-Options: DENY` sits alongside it for the handful of older clients
 * that only understand the legacy header.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The application uses none of these browser capabilities anywhere.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Native Node addon (Argon2) — must be required at runtime by the server,
  // not bundled. It is never reachable from client or edge code.
  serverExternalPackages: ["@node-rs/argon2"],
  // A self-contained `.next/standalone` output (server + only the
  // dependencies actually traced from the code that runs) — what the
  // production Dockerfile copies into its runtime stage, instead of shipping
  // the full node_modules tree.
  output: "standalone",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;

