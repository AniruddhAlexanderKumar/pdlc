"use client";

import { useStoredJson } from "@/lib/use-stored-json";

export const COMMAND_CENTER_TAB_STORAGE_KEY = "pdlc:command-center-tab";

/**
 * The six sections beyond "Needs attention" — now tabs, one visible at a
 * time, instead of a stack a reader scrolled through or a set of checkboxes
 * that hid some of them. `ProjectHeaderCard`, `AtAGlanceStrip`, and
 * `AttentionSection` are deliberately not here — the first identifies which
 * project this is, and the second two are the actual point of this page
 * (see the file's own "read model... nothing here is a new verdict" doc
 * comment); putting either behind a tab click would defeat the page, not
 * simplify it. Order is fixed and matches `CommandCenterView`'s tab order.
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

const DEFAULT_TAB: CommandCenterSectionKey = "readiness";
const VALID_KEYS: ReadonlySet<string> = new Set(COMMAND_CENTER_SECTIONS.map((section) => section.key));

function isSectionKey(value: unknown): value is CommandCenterSectionKey {
  return typeof value === "string" && VALID_KEYS.has(value);
}

/**
 * Which of the six section tabs is open, remembered per browser
 * (localStorage) and per *project* — the key includes `projectId`, since
 * which detail matters varies by what a project actually has going on (a
 * project with active suppliers is naturally reopened on Suppliers more
 * than one with none).
 *
 * This used to be a set of *hidden* sections shown all at once, with a
 * "Customize layout" popover to toggle each — six cards, most or all of
 * them stacked and visible by default, which was exactly the "too much on
 * one page" problem a project's Command Center is most prone to. A tab
 * shows one section at a time by construction; nothing needed a hide
 * toggle anymore; the popover is gone.
 *
 * The storage key changed (`…-layout` → `…-tab`) rather than reusing the
 * old one: the old value was a JSON array of hidden keys, this one is a
 * single key string, and reading old data as the new shape would silently
 * misbehave rather than error. `isSectionKey` guards the read regardless,
 * so a stale or hand-edited value can never select a tab that does not
 * exist — it falls back to Readiness instead.
 */
export function useCommandCenterLayout(projectId: string) {
  const [stored, setStored] = useStoredJson<string>(
    `${COMMAND_CENTER_TAB_STORAGE_KEY}:${projectId}`,
    DEFAULT_TAB,
  );

  const activeTab: CommandCenterSectionKey = isSectionKey(stored) ? stored : DEFAULT_TAB;

  return { activeTab, setActiveTab: setStored };
}
