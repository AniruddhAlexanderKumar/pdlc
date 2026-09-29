"use client";

import * as React from "react";
import { THEME_PREFERENCES, THEME_STORAGE_KEY, type ThemePreference } from "./theme-constants";
import { useStoredJson } from "./use-stored-json";

export { THEME_PREFERENCES, THEME_STORAGE_KEY, type ThemePreference };

function isThemePreference(value: unknown): value is ThemePreference {
  return typeof value === "string" && (THEME_PREFERENCES as readonly string[]).includes(value);
}

/**
 * Applies a theme preference to the document root — the single place that
 * touches `document.documentElement.dataset.theme`, so the bootstrap
 * script in `layout.tsx` (which sets the same attribute before hydration,
 * to avoid a flash of the wrong theme) and this hook can never disagree
 * about what value means what. "system" removes the attribute entirely,
 * which is what lets `globals.css`'s `prefers-color-scheme` block apply —
 * see its own comment for the full three-state pattern.
 */
function applyTheme(preference: ThemePreference) {
  if (preference === "system") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.dataset.theme = preference;
  }
}

/**
 * The user's personal appearance preference: follow the OS, or force
 * light/dark regardless of it. Per-browser (`useStoredJson`, the same
 * tradeoff `use-stored-flag.ts`'s page-guide switch already makes for this
 * exact class of preference in this codebase) rather than a synced account
 * setting — light/dark is the kind of thing worth choosing per device
 * anyway (a phone read outdoors wants different defaults than a monitor in
 * a dim room), not a fact about the organization or the user's identity.
 *
 * The stored value is validated on read (`isThemePreference`) — a value
 * left by a future version with a fourth option, or hand-edited storage,
 * falls back to "system" rather than being trusted as-is.
 */
export function useTheme(): [ThemePreference, (value: ThemePreference) => void] {
  const [stored, setStored] = useStoredJson<ThemePreference>(THEME_STORAGE_KEY, "system");
  const preference = isThemePreference(stored) ? stored : "system";

  React.useEffect(() => {
    applyTheme(preference);
  }, [preference]);

  return [preference, setStored];
}
