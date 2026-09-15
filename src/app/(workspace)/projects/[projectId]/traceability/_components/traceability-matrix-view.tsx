"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Check, Download, Printer, RefreshCw, TriangleAlert } from "lucide-react";
import { traceabilityDetailRoute } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import {
  type TraceabilityMatrixCellDto,
  type TraceabilityMatrixDto,
  useTraceabilityMatrix,
} from "@/lib/api/traceability-matrix";
import { PageHeader } from "@/components/common/page-header";
import { Identifier } from "@/components/common/identifier";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn, formatIsoDate } from "@/lib/utils";

/**
 * The Requirement × Verification Activity traceability matrix.
 *
 * Question this answers: *which requirements are verified by what, and
 * where are the holes?* (Master Prompt 4 §4.) A real `<table>`, not a
 * virtualized ARIA grid like the data grid elsewhere in this app — this
 * view does not need row virtualization at any realistic project scale,
 * and a native table is the more accessible, more keyboard-navigable, and
 * far more print-friendly choice for something this shape (native table
 * page-breaks; a `role="grid"` full of absolutely-positioned divs does
 * not).
 */
export function TraceabilityMatrixView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const { state, reload } = useTraceabilityMatrix(projectId);
  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const [showOnlyUncovered, setShowOnlyUncovered] = React.useState(false);
  const [dense, setDense] = React.useState(false);
  const [openCell, setOpenCell] = React.useState<{ row: TraceabilityMatrixDto["rows"][number]; column: TraceabilityMatrixDto["columns"][number]; cell: TraceabilityMatrixCellDto } | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Verification Coverage Matrix"
        description={
          projectName
            ? `Which requirements ${projectName} verifies, and how — a real relationship in every filled cell, and a gap in every empty one.`
            : "Which requirements this project verifies, and how."
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/traceability`}>Back to Explorer</Link>
          </Button>
        }
      />

      {state.phase === "loading" && <LoadingState label="Loading the coverage matrix…" />}

      {state.phase === "error" && (
        <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(state.error)}</span>
          </p>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {state.phase === "ready" && (
        <MatrixBody
          projectId={projectId}
          matrix={state.data}
          showOnlyUncovered={showOnlyUncovered}
          onShowOnlyUncoveredChange={setShowOnlyUncovered}
          dense={dense}
          onDenseChange={setDense}
          onOpenCell={setOpenCell}
        />
      )}

      <Sheet open={openCell !== null} onOpenChange={(open) => !open && setOpenCell(null)}>
        <SheetContent>
          {openCell && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <Identifier value={openCell.row.identifier} /> verified by{" "}
                  <Identifier value={openCell.column.identifier} />
                </SheetTitle>
                <SheetDescription>The real relationship behind this cell.</SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Requirement</span>
                  <span>{openCell.row.title}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Verification activity</span>
                  <span>{openCell.column.title}</span>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Recorded</span>
                  <span className="font-mono" title={openCell.cell.createdAt}>
                    {formatIsoDate(openCell.cell.createdAt)}
                  </span>
                </div>
                {openCell.cell.note && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Note</span>
                    <p>{openCell.cell.note}</p>
                  </div>
                )}
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MatrixBody({
  projectId,
  matrix,
  showOnlyUncovered,
  onShowOnlyUncoveredChange,
  dense,
  onDenseChange,
  onOpenCell,
}: {
  projectId: string;
  matrix: TraceabilityMatrixDto;
  showOnlyUncovered: boolean;
  onShowOnlyUncoveredChange: (value: boolean) => void;
  dense: boolean;
  onDenseChange: (value: boolean) => void;
  onOpenCell: (value: { row: TraceabilityMatrixDto["rows"][number]; column: TraceabilityMatrixDto["columns"][number]; cell: TraceabilityMatrixCellDto } | null) => void;
}) {
  const cellByKey = React.useMemo(() => {
    const map = new Map<string, TraceabilityMatrixCellDto>();
    for (const cell of matrix.cells) map.set(`${cell.rowId}:${cell.columnId}`, cell);
    return map;
  }, [matrix.cells]);

  const uncoveredRowSet = React.useMemo(() => new Set(matrix.uncoveredRowIds), [matrix.uncoveredRowIds]);

  const visibleRows = showOnlyUncovered ? matrix.rows.filter((r) => uncoveredRowSet.has(r.id)) : matrix.rows;

  if (matrix.rows.length === 0) {
    return (
      <EmptyState
        title="No requirements yet"
        description="This project has no requirements to check verification coverage against."
      />
    );
  }
  if (matrix.columns.length === 0) {
    return (
      <EmptyState
        icon={<TriangleAlert aria-hidden="true" />}
        title="No verification activities recorded"
        description={`Every one of ${matrix.rows.length} requirement(s) is uncovered — there is nothing in this project to verify against yet.`}
      />
    );
  }

  function handleExportCsv() {
    const header = ["Requirement", ...matrix.columns.map((c) => c.identifier)].join(",");
    const lines = matrix.rows.map((row) =>
      [row.identifier, ...matrix.columns.map((col) => (cellByKey.has(`${row.id}:${col.id}`) ? "x" : ""))].join(","),
    );
    const csv = [header, ...lines].join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `verification-coverage-${projectId}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* The coverage gap count IS the primary read (§4) — shown before the
          matrix itself, not buried in a corner of it. */}
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 rounded-md border p-3",
          matrix.uncoveredRowIds.length > 0 ? "border-l-4 border-l-warning bg-warning/5" : "border-border",
        )}
      >
        <p className="text-sm">
          {matrix.uncoveredRowIds.length === 0 ? (
            <span className="flex items-center gap-1.5 text-success">
              <Check className="size-4" aria-hidden="true" />
              Every requirement has at least one verification activity.
            </span>
          ) : (
            <>
              <span className="font-mono font-semibold text-warning">{matrix.uncoveredRowIds.length}</span> of{" "}
              <span className="font-mono">{matrix.rows.length}</span> requirement
              {matrix.rows.length === 1 ? "" : "s"} {matrix.uncoveredRowIds.length === 1 ? "has" : "have"} no
              recorded verification activity at all.
            </>
          )}
        </p>
        {matrix.uncoveredRowIds.length > 0 && (
          <Button variant="outline" size="sm" onClick={() => onShowOnlyUncoveredChange(!showOnlyUncovered)}>
            {showOnlyUncovered ? "Show all requirements" : "Show only uncovered"}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Button variant="outline" size="sm" onClick={() => onDenseChange(!dense)}>
          {dense ? "Readable mode" : "Dense mode"}
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCsv}>
          <Download aria-hidden="true" />
          Export CSV
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.print()}>
          <Printer aria-hidden="true" />
          Print / Save as PDF
        </Button>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {visibleRows.length} × {matrix.columns.length} cells
        </span>
      </div>

      <div className="overflow-auto rounded-md border border-border print:overflow-visible print:border-none">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Requirement verification coverage: rows are requirements, columns are verification activities, and a
            marked cell means the requirement is verified by that activity.
          </caption>
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-20 border-b border-r border-border bg-secondary/90 px-2 py-2 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Requirement
              </th>
              {matrix.columns.map((column) => (
                <th
                  key={column.id}
                  scope="col"
                  className={cn(
                    "sticky top-0 z-10 border-b border-border bg-secondary/90 px-1 py-2 text-center align-bottom font-mono text-xs font-medium text-muted-foreground",
                    dense ? "w-8" : "w-14",
                    matrix.uncoveredColumnIds.includes(column.id) && "bg-warning/10",
                  )}
                  title={column.title}
                >
                  <span className={dense ? "sr-only" : "[writing-mode:vertical-rl] whitespace-nowrap"}>
                    {column.identifier}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row) => {
              const isUncovered = uncoveredRowSet.has(row.id);
              const href = traceabilityDetailRoute("REQUIREMENT", projectId, row.id);
              return (
                <tr key={row.id} className={isUncovered ? "bg-warning/5" : undefined}>
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 border-r border-b border-border bg-card px-2 py-1.5 text-left font-normal",
                      isUncovered && "bg-warning/5",
                    )}
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {href ? (
                        <Link href={href} className="truncate font-mono text-xs underline-offset-4 hover:underline">
                          {row.identifier}
                        </Link>
                      ) : (
                        <span className="truncate font-mono text-xs">{row.identifier}</span>
                      )}
                      {isUncovered && <TriangleAlert className="size-3 shrink-0 text-warning" aria-hidden="true" />}
                    </div>
                    {!dense && <div className="truncate text-xs text-muted-foreground">{row.title}</div>}
                  </th>
                  {matrix.columns.map((column) => {
                    const cell = cellByKey.get(`${row.id}:${column.id}`);
                    return (
                      <td
                        key={column.id}
                        className={cn("border-b border-border px-1 py-1.5 text-center", dense ? "h-8" : "h-10")}
                      >
                        {cell ? (
                          <button
                            type="button"
                            onClick={() => onOpenCell({ row, column, cell })}
                            aria-label={`${row.identifier} is verified by ${column.identifier} — open detail`}
                            className="mx-auto flex size-6 items-center justify-center rounded-xs text-success hover:bg-success/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Check className="size-4" aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
