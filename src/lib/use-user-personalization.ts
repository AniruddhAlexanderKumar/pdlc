"use client";

import * as React from "react";

export const DEFAULT_LANDING_KEY = "pdlc:default-landing-module";

export interface DefaultLandingOption {
  /** Path under `/projects/:id`, or "" for the project's own page. */
  value: string;
  label: string;
  description: string;
}

/**
 * Where "Open project" takes you. The one personal setting on this page
 * that changes what happens elsewhere in the product.
 */
export const LANDING_MODULE_OPTIONS: ReadonlyArray<DefaultLandingOption> = [
  {
    value: "",
    label: "Project page",
    description: "The project's own page, which starts with the next thing to do. Best if you're new.",
  },
  {
    value: "/command-center",
    label: "Command Center",
    description: "Everything that needs attention in the project, drawn from each engine that produced it.",
  },
  {
    value: "/requirements",
    label: "Requirements",
    description: "Straight into the list of things the product must do.",
  },
  {
    value: "/decisions",
    label: "Decisions",
    description: "Engineering decisions, the alternatives considered, and why one was chosen.",
  },
  {
    value: "/sentinel",
    label: "Sentinel",
    description: "Analyses a recent change has called into question.",
  },
  {
    value: "/traceability",
    label: "Traceability",
    description: "How requirements, design, checks and risks connect to each other.",
  },
];

/** New readers land on the project page, where the next step is spelled out. */
const DEFAULT_LANDING = "";

const CHANGE_EVENT = `pdlc:local-string-changed:${DEFAULT_LANDING_KEY}`;

/**
 * Only a value that is one of the offered options is honoured. Anything else
 * in storage — an option since removed, or a hand-edited value — falls back
 * to the default rather than becoming a path the app navigates to.
 */
function readLanding(): string {
  try {
    const stored = window.localStorage.getItem(DEFAULT_LANDING_KEY);
    if (stored !== null && LANDING_MODULE_OPTIONS.some((option) => option.value === stored)) {
      return stored;
    }
  } catch {
    // Storage unavailable (private browsing, blocked): use the default.
  }
  return DEFAULT_LANDING;
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/**
 * Personal preferences that change behaviour elsewhere.
 *
 * This used to hold three settings and load them with a `useEffect` that
 * called `setState` after mount — a second render on every page, and the
 * pattern `use-stored-flag.ts` itself documents as the one to avoid. Two of
 * the three did nothing:
 *
 * - `focusMode` ("standard" / "compact" / "focus") was stored and exposed,
 *   and read by nothing anywhere in the product.
 * - `showExpressBar` controlled a numbered "Express Workflows" menu in the
 *   top bar whose second step linked to a simulated store integration, and
 *   whose five links all led to the same page when no project was open.
 *   That menu is gone; the project page's next-step panel does its job
 *   from real data.
 *
 * What is left is read through `useSyncExternalStore`, so the server and
 * the first client render agree and there is no post-mount correction.
 * A string snapshot compares by value, so no caching is needed.
 *
 * The stored format is unchanged — a plain path string — so anyone who had
 * already chosen a landing page keeps their choice.
 */
export function useUserPersonalization() {
  const landingModule = React.useSyncExternalStore(subscribe, readLanding, () => DEFAULT_LANDING);

  const setLandingModule = React.useCallback((href: string) => {
    try {
      window.localStorage.setItem(DEFAULT_LANDING_KEY, href);
    } catch {
      // Not remembered across visits, but the event below still updates
      // every reader for the rest of this session.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  return { landingModule, setLandingModule };
}
