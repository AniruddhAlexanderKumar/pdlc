"use client";

import * as React from "react";
import { useStoredJson } from "@/lib/use-stored-json";

/** Exported so the Settings page can present and edit the same state the sidebar reads. */
export const NAV_CUSTOMIZATION_STORAGE_KEY = "pdlc:nav-customization";

/**
 * A module a user can never hide — the front door itself. Hiding it would
 * strand navigation. Every other entry in `PROJECT_MODULES` and `NAV_ITEMS`
 * is fair game.
 */
export const ALWAYS_VISIBLE_HREF = "/command-center";

interface NavCustomizationState {
  hidden: string[];
}

const DEFAULT_STATE: NavCustomizationState = { hidden: [] };

/**
 * Per-browser navigation customization: which pages a user has hidden
 * because they never use them. A hidden page drops out of the sidebar, the
 * tab bar and the command palette alike. Same tradeoff `use-theme.ts`
 * already makes for this class of preference: remembered per device, not
 * synced to the account.
 *
 * There used to be a second half — "pinning" a module into its own sidebar
 * section, and a "Simplify" switch that collapsed the sidebar — both
 * workarounds for a sidebar that listed every module at once. The sidebar
 * now lists a handful of places with each one's pages as tabs, so neither
 * had anything left to do. Storage written by that version (with a
 * `pinned` list) still reads fine: the extra field is ignored.
 */
export function useNavCustomization() {
  const [stored, setStored] = useStoredJson<NavCustomizationState>(
    NAV_CUSTOMIZATION_STORAGE_KEY,
    DEFAULT_STATE,
  );

  const hidden = React.useMemo(() => new Set(stored.hidden ?? []), [stored.hidden]);

  const setHidden = React.useCallback(
    (href: string, isHidden: boolean) => {
      if (href === ALWAYS_VISIBLE_HREF) return;
      setStored((prev) => {
        const previous = prev.hidden ?? [];
        return {
          hidden: isHidden ? [...new Set([...previous, href])] : previous.filter((entry) => entry !== href),
        };
      });
    },
    [setStored],
  );

  const reset = React.useCallback(() => setStored(DEFAULT_STATE), [setStored]);

  return { hidden, setHidden, reset };
}
