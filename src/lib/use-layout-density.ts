"use client";

import type { Density } from "@/components/data-grid/data-grid-types";
import { useStoredJson } from "./use-stored-json";

export const LAYOUT_DENSITY_STORAGE_KEY = "pdlc:layout-density";

export const LAYOUT_DENSITIES = ["comfortable", "compact"] as const satisfies readonly Density[];

function isDensity(value: unknown): value is Density {
  return value === "comfortable" || value === "compact";
}

/**
 * The personal, global counterpart to a data grid's own per-grid density
 * (`Density`, from `@/components/data-grid/data-grid-types` — reused
 * directly rather than redefined, so "compact" means the same thing
 * everywhere it appears). Two things read this:
 *
 * - `useDataGridState` seeds a *grid a reader has never touched yet* from
 *   this value instead of a hardcoded "comfortable" — a grid the reader
 *   has already set an explicit density on keeps that choice regardless
 *   of what this preference later becomes; only the untouched default
 *   moves.
 * - Command Center reduces its own multi-column layouts to one column in
 *   "compact" — an actual second arrangement, not just a smaller value in
 *   a table, which is what "another layout" in Settings' new
 *   Personalization section actually changes.
 *
 * Per-browser, same tradeoff `useTheme` and every other personal
 * preference in this app already makes.
 */
export function useLayoutDensity(): [Density, (value: Density) => void] {
  const [stored, setStored] = useStoredJson<Density>(LAYOUT_DENSITY_STORAGE_KEY, "comfortable");
  const density = isDensity(stored) ? stored : "comfortable";
  return [density, setStored];
}
