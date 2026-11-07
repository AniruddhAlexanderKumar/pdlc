/**
 * Deliberately its own file, with no "use client" directive: `layout.tsx`
 * (a Server Component) needs this exact string, and importing a plain
 * constant from a "use client" module into a Server Component does not
 * reliably cross that boundary in this bundler — found as a real bug, not
 * assumed. The root layout's inline bootstrap script ended up reading
 * `window.localStorage.getItem(undefined)` because `THEME_STORAGE_KEY`,
 * previously exported from `use-theme.ts` (which is "use client"),
 * resolved to `undefined` in the server bundle. A plain value has no
 * reason to live in a client-only module in the first place — only the
 * hook that touches `useSyncExternalStore` and `document` does.
 */
export const THEME_STORAGE_KEY = "pdlc:theme";

export const THEME_PREFERENCES = ["system", "light", "dark"] as const;
export type ThemePreference = (typeof THEME_PREFERENCES)[number];
