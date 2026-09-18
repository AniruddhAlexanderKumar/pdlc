"use client";

import { useStoredFlag } from "./use-stored-flag";

export const WORKFLOW_ADVANCED_MODE_KEY = "pdlc:workflow-advanced-mode";
export const AUTO_SHOW_GUIDE_KEY = "pdlc:auto-show-guide";

/**
 * Manages user workflow experience preferences:
 * - isSimpleMode: defaults to true (simple 3-bullet overview mode).
 * - autoShowGuide: whether to auto-suggest step-by-step guidance drawers.
 */
export function useWorkflowExperience() {
  const [isAdvancedMode, setIsAdvancedMode] = useStoredFlag(WORKFLOW_ADVANCED_MODE_KEY);
  const [autoShowGuide, setAutoShowGuide] = useStoredFlag(AUTO_SHOW_GUIDE_KEY);

  const isSimpleMode = !isAdvancedMode;

  const setSimpleMode = (simple: boolean) => {
    setIsAdvancedMode(!simple);
  };

  return {
    isSimpleMode,
    setSimpleMode,
    autoShowGuide,
    setAutoShowGuide,
  };
}
