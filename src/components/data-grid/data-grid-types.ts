import type * as React from "react";

/**
 * One column's definition. Domain-agnostic on purpose — the same `DataGrid`
 * renders requirements, risks, or evidence; nothing here knows what a
 * requirement is.
 */
export interface DataGridColumn<T> {
  /** Stable id — persisted in localStorage as part of column order/visibility/width, so never rename one casually. */
  id: string;
  header: string;
  /** Renders the cell's contents. */
  cell: (row: T) => React.ReactNode;
  /**
   * Plain value for sort, CSV/TSV export, and copy — never derived from
   * `cell`'s rendered output, so a badge or icon cell still exports as
   * real text.
   */
  accessor: (row: T) => string | number | null;
  /** Initial width in pixels. The user's own resize, once made, wins over this. */
  width?: number;
  minWidth?: number;
  align?: "left" | "right" | "center";
  /** Right-aligned tabular-nums numeric column (§3). Implies align "right" unless overridden. */
  numeric?: boolean;
  sortable?: boolean;
  /** Hidden by default; still available from the column picker. */
  hiddenByDefault?: boolean;
  /** Never shown in the column picker or hidden — for the frozen identifier column. */
  alwaysVisible?: boolean;
}

export type SortDirection = "asc" | "desc";

export interface SortRule {
  columnId: string;
  direction: SortDirection;
}

export type Density = "comfortable" | "compact";

/** One removable filter chip — the grid renders these; the caller owns what a filter actually means. */
export interface FilterChip {
  key: string;
  label: string;
  onRemove: () => void;
}

export interface DataGridPersistedState {
  columnOrder: string[];
  hiddenColumns: string[];
  columnWidths: Record<string, number>;
  density: Density;
  sort: SortRule[];
}

export const DEFAULT_GRID_STATE: DataGridPersistedState = {
  columnOrder: [],
  hiddenColumns: [],
  columnWidths: {},
  density: "comfortable",
  sort: [],
};
