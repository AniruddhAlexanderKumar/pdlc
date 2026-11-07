"use client";

import * as React from "react";
import { useLayoutDensity } from "@/lib/use-layout-density";
import { useStoredJson } from "@/lib/use-stored-json";
import {
  DEFAULT_GRID_STATE,
  type DataGridColumn,
  type DataGridPersistedState,
  type Density,
  type SortDirection,
  type SortRule,
} from "./data-grid-types";

/**
 * Column order/visibility/width, sort, and density — persisted per browser
 * per grid (§2: "persisted per user per module"; see `use-stored-json.ts`
 * for why this is per-browser rather than server-backed in this pass).
 *
 * `storageKey` should be stable and specific to one grid — e.g.
 * `"requirements"` — and distinct across modules that show different
 * columns, or one module's saved layout will bleed into another's.
 */
export function useDataGridState<T>(storageKey: string, columns: DataGridColumn<T>[]) {
  // A grid this browser has never touched seeds its density from the
  // reader's global "Layout" preference (Settings → Personalization)
  // instead of a hardcoded "comfortable" — but only ever at that first
  // read: `useStoredJson`'s fallback is consulted only when nothing is
  // stored yet for *this* grid's own key, so a grid with its own explicit
  // density keeps it even if the global preference later changes.
  const [globalDensity] = useLayoutDensity();
  const fallback = React.useMemo(
    () => ({ ...DEFAULT_GRID_STATE, density: globalDensity }),
    [globalDensity],
  );
  const [stored, setStored] = useStoredJson<DataGridPersistedState>(`pdlc:grid:${storageKey}`, fallback);

  // The persisted column order only ever names columns that existed when it
  // was saved — a column added to the definition later (a module ships a
  // new field) has to appear somewhere, so anything not yet in the stored
  // order is appended, in definition order, after it.
  const columnOrder = React.useMemo(() => {
    const known = new Set(stored.columnOrder);
    const missing = columns.map((c) => c.id).filter((id) => !known.has(id));
    const stillExists = new Set(columns.map((c) => c.id));
    return [...stored.columnOrder.filter((id) => stillExists.has(id)), ...missing];
  }, [stored.columnOrder, columns]);

  const hiddenColumns = React.useMemo(() => {
    // First-ever read (nothing stored yet): fall back to each column's own
    // hiddenByDefault, rather than showing everything and surprising the
    // user with a wider grid than the module intended.
    if (stored.columnOrder.length === 0 && stored.hiddenColumns.length === 0) {
      return new Set(columns.filter((c) => c.hiddenByDefault).map((c) => c.id));
    }
    return new Set(stored.hiddenColumns);
  }, [stored.columnOrder.length, stored.hiddenColumns, columns]);

  function setColumnOrder(order: string[]) {
    setStored((prev) => ({ ...prev, columnOrder: order }));
  }

  function toggleColumn(id: string) {
    setStored((prev) => {
      const next = new Set(hiddenColumns);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return { ...prev, hiddenColumns: [...next] };
    });
  }

  function setColumnWidth(id: string, width: number) {
    setStored((prev) => ({ ...prev, columnWidths: { ...prev.columnWidths, [id]: width } }));
  }

  function setDensity(density: Density) {
    setStored((prev) => ({ ...prev, density }));
  }

  /** Left-click sets/replaces the primary sort; shift-click adds/removes a secondary key. */
  function toggleSort(columnId: string, additive: boolean) {
    setStored((prev) => {
      const existingIndex = prev.sort.findIndex((rule) => rule.columnId === columnId);
      let nextSort: SortRule[];

      if (!additive) {
        const current = prev.sort[0];
        const direction: SortDirection =
          current?.columnId === columnId && current.direction === "asc" ? "desc" : "asc";
        nextSort =
          current?.columnId === columnId && current.direction === "desc"
            ? []
            : [{ columnId, direction }];
      } else if (existingIndex === -1) {
        nextSort = [...prev.sort, { columnId, direction: "asc" }];
      } else {
        const current = prev.sort[existingIndex]!;
        if (current.direction === "asc") {
          nextSort = prev.sort.map((rule, i) => (i === existingIndex ? { ...rule, direction: "desc" } : rule));
        } else {
          nextSort = prev.sort.filter((_, i) => i !== existingIndex);
        }
      }
      return { ...prev, sort: nextSort };
    });
  }

  function clearSort() {
    setStored((prev) => ({ ...prev, sort: [] }));
  }

  return {
    columnOrder,
    hiddenColumns,
    columnWidths: stored.columnWidths,
    density: stored.density,
    sort: stored.sort,
    setColumnOrder,
    toggleColumn,
    setColumnWidth,
    setDensity,
    toggleSort,
    clearSort,
  };
}
