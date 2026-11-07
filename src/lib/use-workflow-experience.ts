"use client";

import { useStoredFlag } from "./use-stored-flag";

export const WORKFLOW_ADVANCED_MODE_KEY = "pdlc:workflow-advanced-mode";

/**
 * How much detail the reader wants from the step-by-step guide.
 *
 * `isSimpleMode` is the default: a short overview rather than every step.
 * Stored inverted, as "advanced mode", so that an unset flag — every reader
 * who has never touched the setting — reads as simple without needing a
 * migration or a default written into storage.
 *
 * An `autoShowGuide` flag also lived here, surfaced in Settings as
 * "Contextual Auto-Guide Co-Pilot". Nothing ever read it: the Settings
 * control was both its only writer and its only reader, so the switch was
 * inert from the day it shipped. Removed rather than wired up, because the
 * behaviour it described — guidance appearing on its own when you navigate
 * — is the thing the single Help button replaced.
 */
export function useWorkflowExperience() {
  const [isAdvancedMode, setIsAdvancedMode] = useStoredFlag(WORKFLOW_ADVANCED_MODE_KEY);

  return {
    isSimpleMode: !isAdvancedMode,
    setSimpleMode: (simple: boolean) => setIsAdvancedMode(!simple),
  };
}
