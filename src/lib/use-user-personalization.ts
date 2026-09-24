"use client";

import React from "react";

export const DEFAULT_LANDING_KEY = "pdlc:default-landing-module";
export const EXPRESS_BAR_VISIBLE_KEY = "pdlc:express-bar-visible";
export const FOCUS_MODE_KEY = "pdlc:focus-mode";

export type FocusModeOption = "standard" | "compact" | "focus";

export interface DefaultLandingOption {
  value: string;
  label: string;
  description: string;
}

export const LANDING_MODULE_OPTIONS: ReadonlyArray<DefaultLandingOption> = [
  {
    value: "/command-center",
    label: "Command Center",
    description: "Overview of attention items, baseline status, and active surveillance alerts (Default).",
  },
  {
    value: "/requirements",
    label: "Requirements Registry",
    description: "Direct entry into requirements, quality health scores, and specification drafts.",
  },
  {
    value: "/decisions",
    label: "Decisions & Trade Studies",
    description: "Focus on active engineering decisions, alternatives, and trade-off rationales.",
  },
  {
    value: "/sentinel",
    label: "Decision Sentinel",
    description: "Continuous surveillance alerts for broken assumptions and unverified changes.",
  },
  {
    value: "/traceability",
    label: "Traceability Explorer",
    description: "Graph view connecting requirements, design items, verification, and risks.",
  },
  {
    value: "",
    label: "Project Overview",
    description: "High-level summary grid of all active engineering modules and team activity.",
  },
];

export function useUserPersonalization() {
  const [showExpressBarRaw, setShowExpressBarRaw] = React.useState<boolean>(true);
  const [focusModeRaw, setFocusModeRaw] = React.useState<FocusModeOption>("standard");
  const [landingModuleRaw, setLandingModuleRaw] = React.useState<string>("/command-center");

  React.useEffect(() => {
    try {
      const storedExpress = localStorage.getItem(EXPRESS_BAR_VISIBLE_KEY);
      if (storedExpress !== null) {
        setShowExpressBarRaw(storedExpress !== "false");
      }
      const storedLanding = localStorage.getItem(DEFAULT_LANDING_KEY);
      if (storedLanding !== null) {
        setLandingModuleRaw(storedLanding);
      }
      const storedFocus = localStorage.getItem(FOCUS_MODE_KEY) as FocusModeOption | null;
      if (storedFocus && ["standard", "compact", "focus"].includes(storedFocus)) {
        setFocusModeRaw(storedFocus);
      }
    } catch {
      // Ignore SSR / restricted storage access errors
    }
  }, []);

  const setShowExpressBar = (visible: boolean) => {
    setShowExpressBarRaw(visible);
    try {
      localStorage.setItem(EXPRESS_BAR_VISIBLE_KEY, visible ? "true" : "false");
    } catch {
      // Ignore
    }
  };

  const setLandingModule = (href: string) => {
    setLandingModuleRaw(href);
    try {
      localStorage.setItem(DEFAULT_LANDING_KEY, href);
    } catch {
      // Ignore
    }
  };

  const setFocusMode = (mode: FocusModeOption) => {
    setFocusModeRaw(mode);
    try {
      localStorage.setItem(FOCUS_MODE_KEY, mode);
    } catch {
      // Ignore
    }
  };

  return {
    showExpressBar: showExpressBarRaw,
    setShowExpressBar,
    landingModule: landingModuleRaw,
    setLandingModule,
    focusMode: focusModeRaw,
    setFocusMode,
  };
}
