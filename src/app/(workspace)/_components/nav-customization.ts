"use client";

import * as React from "react";
import { useStoredJson } from "@/lib/use-stored-json";
import { useWorkflowExperience } from "@/lib/use-workflow-experience";

/** Exported so the Settings page can present and edit the same state the sidebar reads. */
export const NAV_CUSTOMIZATION_STORAGE_KEY = "pdlc:nav-customization";

/**
 * A module a user can never untick in Settings. Every other entry in
 * `PROJECT_MODULES` and `NAV_ITEMS` is fair game. Simple view does keep it
 * out of the sidebar (see {@link SIMPLE_VIEW_HIDDEN}); the project's
 * Overview, which says what to do next, is the front door there, and
 * "Show all tools" brings Command Center straight back.
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

/**
 * The pages Simple view keeps out of the sidebar and the tabs: the
 * specialist tools a team grows into — certification, operational drift,
 * suppliers, change surveillance — and Command Center, whose list of every
 * open item from every engine is a lot to meet on day one. What remains
 * is the core of the six steps: requirements, design, decisions, checks
 * and their proof, changes, risks, problems, and locking a baseline.
 *
 * Nothing is removed or blocked. Every page still opens from a link, from
 * the project's "All modules" list, and from the jump-to search
 * (`Ctrl`/`Cmd`+`K`, which deliberately ignores Simple view), and
 * "Show all tools" brings them back to the sidebar in one click.
 *
 * Unlike the old "Simplify" switch (see above), this is not a way to cope
 * with a long list; it decides which tools a newcomer is shown at all.
 */
export const SIMPLE_VIEW_HIDDEN: ReadonlySet<string> = new Set([
  "/command-center",
  "/stakeholder-needs",
  "/suppliers",
  "/observations",
  "/drift",
  "/certification",
  "/sentinel",
  "/history",
  "/traceability",
]);

/**
 * What the sidebar and the tab bar actually leave out: the reader's own
 * choices from Settings, plus {@link SIMPLE_VIEW_HIDDEN} while Simple view is
 * on. Simple view is the same preference that keeps the step-by-step guide
 * short (`useWorkflowExperience`) — one switch for "show me less" — and it
 * is on until someone turns it off.
 */
export function useHiddenModules(): ReadonlySet<string> {
  const { hidden } = useNavCustomization();
  const { isSimpleMode } = useWorkflowExperience();
  return React.useMemo(
    () => (isSimpleMode ? new Set([...hidden, ...SIMPLE_VIEW_HIDDEN]) : hidden),
    [hidden, isSimpleMode],
  );
}
