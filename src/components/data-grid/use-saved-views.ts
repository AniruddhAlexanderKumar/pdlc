"use client";

import * as React from "react";
import { useStoredJson } from "@/lib/use-stored-json";

/** A nameable, reusable filter preset (§2: "Saved views per user and per project, nameable"). */
export interface SavedView<F> {
  id: string;
  name: string;
  filters: F;
}

/**
 * Per-browser saved views (see `use-stored-json.ts` for why this pass
 * scopes preferences per browser rather than per authenticated user — the
 * same tradeoff `useDataGridState` makes for column layout). `storageKey`
 * should already be project-and-module-specific — e.g.
 * `requirements:${projectId}` — so one project's saved views never leak
 * into another's list.
 */
export function useSavedViews<F>(storageKey: string) {
  const fallback = React.useMemo(() => [] as SavedView<F>[], []);
  const [views, setViews] = useStoredJson<SavedView<F>[]>(`pdlc:views:${storageKey}`, fallback);

  function save(name: string, filters: F): void {
    const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}`;
    setViews((prev) => [...prev, { id, name, filters }]);
  }

  function remove(id: string): void {
    setViews((prev) => prev.filter((view) => view.id !== id));
  }

  return { views, save, remove };
}
