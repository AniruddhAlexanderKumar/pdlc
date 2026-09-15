import type { Metadata } from "next";
import Script from "next/script";
import type { ReactNode } from "react";
import { env } from "@/config/env";
import { THEME_STORAGE_KEY } from "@/lib/theme-constants";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: env.NEXT_PUBLIC_APP_NAME,
    template: `%s · ${env.NEXT_PUBLIC_APP_NAME}`,
  },
  description: "Multi-industry product development life cycle platform.",
};

/**
 * Sets `data-theme` before the browser paints anything, straight from
 * localStorage — not from `useTheme` (see `@/lib/use-theme.ts`), which only
 * runs after React hydrates and only on the one page (`/settings`) that
 * calls it. Without this, every *other* page would load in the wrong theme
 * entirely, not just flash it briefly — found exactly that way, live, not
 * assumed: `data-theme` is a plain DOM attribute on `<html>`, which
 * survives client-side navigation on its own once set, but nothing sets it
 * on a fresh page load except this script. `beforeInteractive` is the
 * documented mechanism for exactly this ("critical scripts that need to be
 * fetched as soon as possible", per Next's own docs) — a hand-rolled raw
 * `<script>` tag was tried instead and dropped: in this App Router's RSC
 * streaming model, ordinary JSX content (including a plain inline script
 * written directly in this component) is delivered as an encoded flight
 * payload rather than literal parseable HTML, so it carries no timing
 * guarantee a `next/script` `beforeInteractive` tag doesn't already have
 * from the framework itself — reinventing it added risk, not certainty.
 *
 * `THEME_STORAGE_KEY` comes from `@/lib/theme-constants` — a plain module
 * with no "use client" directive — specifically because it once came from
 * `@/lib/use-theme.ts` instead, which *is* "use client", and importing a
 * plain constant from a client module into this Server Component silently
 * resolved to `undefined` in the server bundle rather than erroring
 * (`window.localStorage.getItem(undefined)`, found by reading the actual
 * rendered HTML, not assumed safe). Import the key from `theme-constants`
 * here, never from `use-theme.ts`.
 *
 * try/catch mirrors `use-stored-json.ts`'s own defensiveness: a private
 * window or blocked storage should leave the page on its default theme,
 * never throw.
 */
const THEME_BOOTSTRAP_SCRIPT = `
try {
  var raw = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var theme = raw ? JSON.parse(raw) : "system";
  if (theme === "light" || theme === "dark") {
    document.documentElement.setAttribute("data-theme", theme);
  }
} catch (e) {}
`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <Script id="theme-bootstrap" strategy="beforeInteractive">
          {THEME_BOOTSTRAP_SCRIPT}
        </Script>
      </head>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
