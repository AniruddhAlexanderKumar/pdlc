"use client";

import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { sortRows } from "./data-grid-sort";
import type { DataGridColumn, SortRule } from "./data-grid-types";
import { useDataGridState } from "./use-data-grid-state";

const ROW_HEIGHT: Record<"comfortable" | "compact", number> = {
  comfortable: 40,
  compact: 30,
};
const HEADER_HEIGHT = 36;
const SELECT_COLUMN_WIDTH = 36;
const DEFAULT_COLUMN_WIDTH = 160;
const MIN_COLUMN_WIDTH = 72;

export interface DataGridProps<T> {
  /** Persisted-state key — see `use-data-grid-state.ts`. Unique per grid. */
  storageKey: string;
  columns: DataGridColumn<T>[];
  rows: T[];
  getRowId: (row: T) => string;
  /** The deterministic sort tie-break (§0) and what the identifier column's own sort compares on. */
  identifierAccessor: (row: T) => string;
  /** Enter, or a row click, activates a row — typically opens the detail panel. */
  onRowActivate?: (row: T) => void;
  /** Additional row styling — e.g. the superseded treatment. Never used to hide a row. */
  rowClassName?: (row: T) => string | undefined;
  /** Rendered in place of the grid body when `rows` is empty. */
  emptyState?: React.ReactNode;
  /** Selection is opt-in — a caller with no bulk actions passes nothing here. */
  selectable?: boolean;
  selectedIds?: ReadonlySet<string>;
  onSelectedIdsChange?: (ids: ReadonlySet<string>) => void;
  /** A ref this grid focuses when the user presses `/` — normally a filter search input. */
  filterInputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}

/**
 * The shared virtualized data grid (Master Prompt 4 §2) — every module's
 * list view renders through this rather than a bespoke `<table>`.
 *
 * Deliberately not a native `<table>`: a real ARIA `grid` (this component)
 * is the correct pattern for something interactively sortable, resizable
 * and keyboard-navigable — the roles below (`grid`/`row`/`columnheader`/
 * `gridcell`) are what screen readers expect for that, and row
 * virtualization (translateY-positioned rows) does not compose with native
 * table layout in the first place.
 */
export function DataGrid<T>({
  storageKey,
  columns,
  rows,
  getRowId,
  identifierAccessor,
  onRowActivate,
  rowClassName,
  emptyState,
  selectable = false,
  selectedIds,
  onSelectedIdsChange,
  filterInputRef,
  className,
}: DataGridProps<T>) {
  const grid = useDataGridState(storageKey, columns);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [activeCell, setActiveCell] = React.useState<{ row: number; col: number }>({ row: 0, col: 0 });

  const visibleColumns = React.useMemo(
    () =>
      grid.columnOrder
        .map((id) => columns.find((c) => c.id === id))
        .filter((c): c is DataGridColumn<T> => c !== undefined && (c.alwaysVisible || !grid.hiddenColumns.has(c.id))),
    [grid.columnOrder, grid.hiddenColumns, columns],
  );

  const sortedRows = React.useMemo(
    () => sortRows(rows, columns, grid.sort, identifierAccessor),
    [rows, columns, grid.sort, identifierAccessor],
  );

  const rowHeight = ROW_HEIGHT[grid.density];
  const virtualizer = useVirtualizer({
    count: sortedRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  });

  const columnWidths = visibleColumns.map((c) => grid.columnWidths[c.id] ?? c.width ?? DEFAULT_COLUMN_WIDTH);
  const gridTemplateColumns =
    (selectable ? `${SELECT_COLUMN_WIDTH}px ` : "") + columnWidths.map((w) => `${w}px`).join(" ");
  const totalColumnCount = visibleColumns.length + (selectable ? 1 : 0);
  // The first *data* column freezes on horizontal scroll (§2), offset past
  // the selection checkbox column when one is present — both cannot sit at
  // left:0 or they overlap.
  const frozenColumnLeft = selectable ? SELECT_COLUMN_WIDTH : 0;

  const allSelected = selectable && sortedRows.length > 0 && sortedRows.every((r) => selectedIds?.has(getRowId(r)));
  const someSelected = selectable && !allSelected && sortedRows.some((r) => selectedIds?.has(getRowId(r)));

  function toggleAll() {
    if (!onSelectedIdsChange) return;
    if (allSelected) {
      onSelectedIdsChange(new Set());
    } else {
      onSelectedIdsChange(new Set(sortedRows.map(getRowId)));
    }
  }

  function toggleOne(id: string) {
    if (!onSelectedIdsChange) return;
    const next = new Set(selectedIds ?? []);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onSelectedIdsChange(next);
  }

  function moveActiveCell(rowDelta: number, colDelta: number) {
    setActiveCell((prev) => ({
      row: Math.max(0, Math.min(sortedRows.length - 1, prev.row + rowDelta)),
      col: Math.max(0, Math.min(totalColumnCount - 1, prev.col + colDelta)),
    }));
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (sortedRows.length === 0) return;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        moveActiveCell(1, 0);
        virtualizer.scrollToIndex(Math.min(sortedRows.length - 1, activeCell.row + 1));
        break;
      case "ArrowUp":
        event.preventDefault();
        moveActiveCell(-1, 0);
        virtualizer.scrollToIndex(Math.max(0, activeCell.row - 1));
        break;
      case "ArrowRight":
        event.preventDefault();
        moveActiveCell(0, 1);
        break;
      case "ArrowLeft":
        event.preventDefault();
        moveActiveCell(0, -1);
        break;
      case "Home":
        event.preventDefault();
        setActiveCell((prev) => ({ ...prev, col: 0 }));
        break;
      case "End":
        event.preventDefault();
        setActiveCell((prev) => ({ ...prev, col: totalColumnCount - 1 }));
        break;
      case "Enter": {
        const row = sortedRows[activeCell.row];
        if (row) onRowActivate?.(row);
        break;
      }
      case " ": {
        if (!selectable) break;
        event.preventDefault();
        const row = sortedRows[activeCell.row];
        if (row) toggleOne(getRowId(row));
        break;
      }
      case "/": {
        if (filterInputRef?.current) {
          event.preventDefault();
          filterInputRef.current.focus();
        }
        break;
      }
      default:
        break;
    }
  }

  function handleResizeStart(columnId: string, startX: number, startWidth: number) {
    function onMove(event: MouseEvent) {
      const next = Math.max(MIN_COLUMN_WIDTH, startWidth + (event.clientX - startX));
      grid.setColumnWidth(columnId, next);
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  if (rows.length === 0 && emptyState) {
    return <>{emptyState}</>;
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        ref={scrollRef}
        role="grid"
        aria-rowcount={sortedRows.length + 1}
        aria-colcount={totalColumnCount}
        aria-label="Data grid"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="relative max-h-[70vh] overflow-auto rounded-md border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {/* Header row — sticky, and its own ARIA row so column headers read correctly. */}
        <div
          role="row"
          aria-rowindex={1}
          className="sticky top-0 z-20 grid border-b border-border bg-secondary/80 backdrop-blur-sm"
          style={{ gridTemplateColumns, height: HEADER_HEIGHT }}
        >
          {selectable && (
            <div
              role="columnheader"
              className="sticky left-0 z-10 flex items-center justify-center border-r border-border bg-secondary/80"
            >
              <Checkbox
                aria-label={allSelected ? "Deselect all rows" : "Select all rows"}
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleAll}
              />
            </div>
          )}
          {visibleColumns.map((column, colIndex) => {
            const sortRule = grid.sort.find((r) => r.columnId === column.id);
            const sortIndex = grid.sort.findIndex((r) => r.columnId === column.id);
            const isFrozen = colIndex === 0;
            return (
              <div
                key={column.id}
                role="columnheader"
                aria-sort={
                  sortRule ? (sortRule.direction === "asc" ? "ascending" : "descending") : "none"
                }
                className={cn(
                  "group relative flex items-center gap-1 border-r border-border px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground",
                  isFrozen && "sticky z-10 bg-secondary/80",
                  column.numeric ? "justify-end" : column.align === "center" ? "justify-center" : "justify-start",
                )}
                style={isFrozen ? { left: frozenColumnLeft } : undefined}
              >
                {column.sortable !== false ? (
                  <button
                    type="button"
                    onClick={(event) => grid.toggleSort(column.id, event.shiftKey)}
                    className="flex min-w-0 items-center gap-1 truncate rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="truncate">{column.header}</span>
                    {sortRule ? (
                      <span className="flex shrink-0 items-center gap-0.5 text-foreground">
                        {sortRule.direction === "asc" ? (
                          <ArrowUp className="size-3" aria-hidden="true" />
                        ) : (
                          <ArrowDown className="size-3" aria-hidden="true" />
                        )}
                        {grid.sort.length > 1 && <span className="text-[10px] tabular-nums">{sortIndex + 1}</span>}
                      </span>
                    ) : (
                      <ArrowUpDown
                        className="size-3 shrink-0 text-transparent group-hover:text-muted-foreground"
                        aria-hidden="true"
                      />
                    )}
                  </button>
                ) : (
                  <span className="truncate">{column.header}</span>
                )}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleResizeStart(column.id, event.clientX, columnWidths[colIndex]!);
                  }}
                  className="absolute -right-1 top-0 h-full w-2 cursor-col-resize select-none"
                />
              </div>
            );
          })}
        </div>

        {/* Virtualized body. */}
        <div style={{ height: virtualizer.getTotalSize(), position: "relative" }}>
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const row = sortedRows[virtualRow.index]!;
            const rowId = getRowId(row);
            const isSelected = selectedIds?.has(rowId) ?? false;
            const isActiveRow = activeCell.row === virtualRow.index;

            return (
              <div
                key={rowId}
                role="row"
                aria-rowindex={virtualRow.index + 2}
                aria-selected={selectable ? isSelected : undefined}
                data-state={isSelected ? "selected" : undefined}
                className={cn(
                  "grid cursor-default border-b border-border transition-colors hover:bg-secondary/40",
                  isSelected && "bg-accent/60",
                  isActiveRow && "ring-1 ring-inset ring-ring",
                  rowClassName?.(row),
                )}
                style={{
                  gridTemplateColumns,
                  height: virtualRow.size,
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
                onClick={() => {
                  setActiveCell({ row: virtualRow.index, col: 0 });
                  onRowActivate?.(row);
                }}
              >
                {selectable && (
                  <div
                    role="gridcell"
                    className="sticky left-0 z-10 flex items-center justify-center border-r border-border bg-card"
                    onClick={(event) => event.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Select row ${identifierAccessor(row)}`}
                      checked={isSelected}
                      onChange={() => toggleOne(rowId)}
                    />
                  </div>
                )}
                {visibleColumns.map((column, colIndex) => (
                  <div
                    key={column.id}
                    role="gridcell"
                    className={cn(
                      "flex items-center overflow-hidden border-r border-border px-2 text-sm",
                      colIndex === 0 && "sticky z-10 bg-card",
                      column.numeric && "justify-end tabular-nums",
                      column.align === "center" && "justify-center",
                    )}
                    style={colIndex === 0 ? { left: frozenColumnLeft } : undefined}
                  >
                    <span className="truncate">{column.cell(row)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export type { SortRule };
