"use client";

import * as React from "react";
import { useStoredJson } from "@/lib/use-stored-json";

export const COMMAND_CENTER_LAYOUT_STORAGE_KEY = "pdlc:command-center-layout";

/**
 * The six sections a reader can remove from their own Command Center.
 * `ProjectHeaderCard`, `AtAGlanceStrip`, and `AttentionSection` are
 * deliberately not here — the first identifies which project this is, and
 * the second two are the actual point of this page (see the file's own
 * "read model... nothing here is a new verdict" doc comment); removing
 * either would defeat the page, not simplify it. Order matches
 * `CommandCenterView`'s own render order, and is fixed — this is visibility
 * only, not a reordering feature.
 */
export const COMMAND_CENTER_SECTIONS = [
  { key: "readiness", label: "Readiness" },
  { key: "configuration", label: "Configuration baseline" },
  { key: "risksIssues", label: "Risks & Issues" },
  { key: "suppliers", label: "Suppliers" },
  { key: "evidence", label: "Evidence" },
  { key: "sentinel", label: "Decision Sentinel" },
] as const;

export type CommandCenterSectionKey = (typeof COMMAND_CENTER_SECTIONS)[number]["key"];

/**
 * Per-browser (localStorage), same tradeoff every other personal
 * preference in this app already makes — remembered on this device, not
 * synced to the account. Deliberately per-*project*: the key includes
 * `projectId`, since which sections matter varies by what a project
 * actually has going on (a project with no suppliers has no reason to
 * carry a "Suppliers hidden" preference into a project that has some).
 */
export function useCommandCenterLayout(projectId: string) {
  const [hiddenArray, setHiddenArray] = useStoredJson<CommandCenterSectionKey[]>(
    `${COMMAND_CENTER_LAYOUT_STORAGE_KEY}:${projectId}`,
    [],
  );

  const hidden = React.useMemo(() => new Set(hiddenArray), [hiddenArray]);

  const setHidden = React.useCallback(
    (key: CommandCenterSectionKey, isHidden: boolean) => {
      setHiddenArray((prev) =>
        isHidden ? [...new Set([...prev, key])] : prev.filter((entry) => entry !== key),
      );
    },
    [setHiddenArray],
  );

  const reset = React.useCallback(() => setHiddenArray([]), [setHiddenArray]);

  return { hidden, setHidden, reset };
}
