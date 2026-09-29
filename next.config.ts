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
  // The floating "N" build-status badge Next.js overlays in the bottom
  // corner during `next dev`. Dev-mode only — it never renders in a
  // production build — but it sat on top of real UI (the workspace's own
  // bottom-left corner) and read as part of the product rather than
  // tooling. Turned off so what a developer sees locally matches what a
  // user sees in production.
  devIndicators: false,
  // `devIndicators: false` above only hides the suppressible route badge;
  // Next's separate compile/runtime error indicator cannot be turned off by
  // design (it must always be able to surface a real error), and it was
  // showing 5 harmless "Node.js API/module ... not supported in the Edge
  // Runtime" warnings from two files. Both are false positives, not real
  // bugs: `instrumentation.ts` guards its Node-only code behind a
  // `NEXT_RUNTIME` check (see that file's own doc comment) that Turbopack's
  // static Edge-compatibility walk doesn't account for, and
  // `generated/prisma/client.ts` is Prisma's own generated output, never
  // imported from Edge code in this app. Fixing the root cause rather than
  // the code shape: this targets exactly those two files, so a real new
  // warning anywhere else still surfaces normally.
  turbopack: {
    ignoreIssue: [
      { path: "**/src/instrumentation.ts", title: /Node\.js API is used/ },
      { path: "**/src/generated/prisma/client.ts", title: /Node\.js module is loaded/ },
    ],
  },
  // Native Node addon (Argon2) — must be required at runtime by the server,
  // not bundled. It is never reachable from client or edge code.
  serverExternalPackages: ["@node-rs/argon2"],
  // A self-contained `.next/standalone` output (server + only the
  // dependencies actually traced from the code that runs) — what the
  // production Dockerfile copies into its runtime stage, instead of shipping
  // the full node_modules tree. Skipped when building on Vercel (which sets
  // `VERCEL=1` in every build environment automatically): Vercel has its own
  // serverless output format and packages the app itself — `standalone`
  // mode there makes the build fail with a missing `.nft.json` trace file,
  // a known incompatibility, not a configuration Vercel's own pipeline
  // supports. This is the only deployment-target-conditional line in this
  // file; every other setting (headers, external packages) applies equally
  // to both paths.
  output: process.env.VERCEL ? undefined : "standalone",
  async headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
