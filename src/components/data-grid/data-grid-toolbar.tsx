"use client";

import * as React from "react";
import { Columns3, Copy, Download, Rows3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { downloadText, toCsv, toTsv } from "./data-grid-export";
import { sortRows } from "./data-grid-sort";
import type { DataGridColumn, Density } from "./data-grid-types";
import type { useDataGridState } from "./use-data-grid-state";

/**
 * A minimal, dependency-free dropdown: a trigger button plus an
 * absolutely-positioned panel, closed on outside click or `Escape`. Scoped
 * to this module rather than a general `ui/popover.tsx` — the column
 * picker is this toolbar's only user of the pattern today.
 *
 * Its open/ref state stays entirely inside this one component rather than
 * being handed out through a custom hook — a ref crossing a hook boundary
 * like that is exactly the shape the React Compiler's static analysis
 * cannot safely trace back to a real `useRef()`, and refuses to compile.
 */
function ColumnPicker<T>({ columns, grid }: { columns: DataGridColumn<T>[]; grid: ReturnType<typeof useDataGridState<T>> }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(event: PointerEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Columns3 aria-hidden="true" />
        Columns
      </Button>
      {open && (
        <div
          role="menu"
          aria-label="Show or hide columns"
          className="absolute right-0 top-full z-30 mt-1 flex max-h-72 w-56 flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-card p-1.5 shadow-lg"
        >
          {columns
            .filter((c) => !c.alwaysVisible)
            .map((column) => {
              const id = `col-toggle-${column.id}`;
              return (
                <label
                  key={column.id}
                  htmlFor={id}
                  className="flex cursor-pointer items-center gap-2 rounded-xs px-2 py-1.5 text-sm hover:bg-secondary"
                >
                  <Checkbox
                    id={id}
                    checked={!grid.hiddenColumns.has(column.id)}
                    onChange={() => grid.toggleColumn(column.id)}
                  />
                  {column.header}
                </label>
              );
            })}
        </div>
      )}
    </div>
  );
}

export interface DataGridToolbarProps<T> {
  columns: DataGridColumn<T>[];
  grid: ReturnType<typeof useDataGridState<T>>;
  /** The rows a CSV export or TSV copy acts on — already filtered/sorted by the caller's view. */
  rows: T[];
  identifierAccessor: (row: T) => string;
  exportFilename: string;
  selectedCount?: number;
  onCopySelected?: () => void;
}

export function DataGridToolbar<T>({
  columns,
  grid,
  rows,
  identifierAccessor,
  exportFilename,
  selectedCount = 0,
  onCopySelected,
}: DataGridToolbarProps<T>) {
  function handleExportCsv() {
    const visible = grid.columnOrder
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is DataGridColumn<T> => c !== undefined && (c.alwaysVisible || !grid.hiddenColumns.has(c.id)));
    const sorted = sortRows(rows, columns, grid.sort, identifierAccessor);
    downloadText(toCsv(sorted, visible), exportFilename, "text/csv;charset=utf-8");
  }

  async function handleCopyAll() {
    const visible = grid.columnOrder
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is DataGridColumn<T> => c !== undefined && (c.alwaysVisible || !grid.hiddenColumns.has(c.id)));
    const sorted = sortRows(rows, columns, grid.sort, identifierAccessor);
    try {
      await navigator.clipboard.writeText(toTsv(sorted, visible));
    } catch {
      // No clipboard permission — the CSV export button is the fallback path.
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {rows.length} row{rows.length === 1 ? "" : "s"}
        {selectedCount > 0 ? ` · ${selectedCount} selected` : ""}
      </span>

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        {selectedCount > 0 && onCopySelected && (
          <Button variant="outline" size="sm" onClick={onCopySelected}>
            <Copy aria-hidden="true" />
            Copy {selectedCount} as TSV
          </Button>
        )}
        {selectedCount === 0 && (
          <Button variant="outline" size="sm" onClick={handleCopyAll} title="Copy the current view as TSV, ready to paste into a spreadsheet">
            <Copy aria-hidden="true" />
            Copy as TSV
          </Button>
        )}

        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download aria-hidden="true" />
          Export CSV
        </Button>

        <div className="inline-flex overflow-hidden rounded-md border border-input">
          <button
            type="button"
            onClick={() => grid.setDensity("comfortable")}
            aria-pressed={grid.density === "comfortable"}
            title="Comfortable row height"
            className={cn(
              "flex h-8 items-center gap-1 px-2 text-xs font-medium",
              grid.density === "comfortable" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50",
            )}
          >
            <Rows3 className="size-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => grid.setDensity("compact")}
            aria-pressed={grid.density === "compact"}
            title="Compact row height"
            className={cn(
              "flex h-8 items-center gap-1 border-l border-input px-2 text-xs font-medium",
              grid.density === "compact" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/50",
            )}
          >
            <Rows3 className="size-3" aria-hidden="true" />
          </button>
        </div>

        <ColumnPicker columns={columns} grid={grid} />
      </div>
    </div>
  );
}

export type { Density };
