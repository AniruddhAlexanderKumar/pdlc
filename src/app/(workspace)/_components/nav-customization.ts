"use client";

import * as React from "react";
import { useStoredJson } from "@/lib/use-stored-json";

/** Exported so the Settings page can present and edit the same state the sidebar reads. */
export const NAV_CUSTOMIZATION_STORAGE_KEY = "pdlc:nav-customization";

/**
 * A module a user can never remove or pin — the front door itself. Hiding
 * it would strand navigation, and pinning something already always shown
 * is meaningless. Every other entry in `PROJECT_MODULES` and `NAV_ITEMS` is
 * fair game.
 */
export const ALWAYS_VISIBLE_HREF = "/command-center";

interface NavCustomizationState {
  hidden: string[];
  pinned: string[];
}

const DEFAULT_STATE: NavCustomizationState = { hidden: [], pinned: [] };

/**
 * Per-browser navigation customization — which modules a user has removed
 * from their sidebar, and which they have pinned to it regardless of what
 * "Simplify" would otherwise collapse. Same tradeoff `use-theme.ts` and
 * `sidebar.tsx`'s own "Simplify" flag already make for this exact class of
 * preference: remembered per device, not synced to the account.
 *
 * Hidden and pinned are mutually exclusive by construction — `setHidden`
 * and `setPinned` each clear the other set's membership for that href, so
 * a module can never be both "removed" and "pinned" at once, a state that
 * would have no coherent meaning to render.
 */
export function useNavCustomization() {
  const [stored, setStored] = useStoredJson<NavCustomizationState>(
    NAV_CUSTOMIZATION_STORAGE_KEY,
    DEFAULT_STATE,
  );

  const hidden = React.useMemo(() => new Set(stored.hidden), [stored.hidden]);
  const pinned = React.useMemo(() => new Set(stored.pinned), [stored.pinned]);

  const setHidden = React.useCallback(
    (href: string, isHidden: boolean) => {
      if (href === ALWAYS_VISIBLE_HREF) return;
      setStored((prev) => ({
        hidden: isHidden
          ? [...new Set([...prev.hidden, href])]
          : prev.hidden.filter((entry) => entry !== href),
        pinned: isHidden ? prev.pinned.filter((entry) => entry !== href) : prev.pinned,
      }));
    },
    [setStored],
  );

  const setPinned = React.useCallback(
    (href: string, isPinned: boolean) => {
      if (href === ALWAYS_VISIBLE_HREF) return;
      setStored((prev) => ({
        pinned: isPinned
          ? [...new Set([...prev.pinned, href])]
          : prev.pinned.filter((entry) => entry !== href),
        hidden: isPinned ? prev.hidden.filter((entry) => entry !== href) : prev.hidden,
      }));
    },
    [setStored],
  );

  const reset = React.useCallback(() => setStored(DEFAULT_STATE), [setStored]);

  return { hidden, pinned, setHidden, setPinned, reset };
}
