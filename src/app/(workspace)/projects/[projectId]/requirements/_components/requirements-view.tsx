"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListChecks, Plus, RefreshCw, Search } from "lucide-react";
import { REQUIREMENT_STATUSES, type RequirementStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { type RequirementListItemDto, useRequirements } from "@/lib/api/requirements";
import { PageHeader } from "@/components/common/page-header";
import { useModuleLabel } from "../../../../_components/terminology-context";
import {
  RequirementPriorityBadge,
  RequirementStatusBadge,
  requirementStatusLabel,
} from "@/components/common/requirement-badges";
import { Identifier } from "@/components/common/identifier";
import { SUPERSEDED_ROW_CLASS, SupersessionMark } from "@/components/common/supersession-mark";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  DataGrid,
  DataGridToolbar,
  FilterChips,
  SavedViewsControl,
  type DataGridColumn,
  type FilterChip,
  useDataGridState,
  useSavedViews,
  useUrlFilterState,
} from "@/components/data-grid";
import { formatIsoDate } from "@/lib/utils";
import { RequirementFormDialog } from "./requirement-form-dialog";

/**
 * Requirements list for one project, through the shared data grid (Master
 * Prompt 4 §2) — the reference implementation every other module's list
 * view is meant to follow.
 *
 * Everything shown comes from `GET /api/projects/:id/requirements`; an
 * empty project shows an empty state rather than a fabricated count.
 */

interface RequirementFilters extends Record<string, string> {
  status: RequirementStatus | "";
  q: string;
}

const FILTER_DEFAULTS: RequirementFilters = { status: "", q: "" };

export function RequirementsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("requirement", "Requirements");
  const [filters, setFilters] = useUrlFilterState<RequirementFilters>(FILTER_DEFAULTS);
  const { state, reload } = useRequirements(projectId, filters.status);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [selectedIds, setSelectedIds] = React.useState<ReadonlySet<string>>(new Set());
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  const savedViews = useSavedViews<RequirementFilters>(`requirements:${projectId}`);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const allRows = React.useMemo(() => (state.phase === "ready" ? state.data : []), [state]);

  // Free-text search runs client-side over the already-loaded, status-
  // filtered result — this app never paginates a list from the server, so
  // the full matching set is already in memory (see `use-resource.ts`).
  const rows = React.useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    if (!q) return allRows;
    return allRows.filter(
      (r) => r.identifier.toLowerCase().includes(q) || r.title.toLowerCase().includes(q),
    );
  }, [allRows, filters.q]);

  const columns = React.useMemo<DataGridColumn<RequirementListItemDto>[]>(
    () => [
      {
        id: "identifier",
        header: "Identifier",
        alwaysVisible: true,
        width: 130,
        accessor: (r) => r.identifier,
        cell: (r) => (
          <Identifier
            value={r.identifier}
            href={`/projects/${projectId}/requirements/${r.id}`}
            onNavigate={(event) => event.stopPropagation()}
          />
        ),
      },
      {
        id: "title",
        header: "Title",
        width: 320,
        accessor: (r) => r.title,
        cell: (r) => (
          <span className="flex items-center gap-2">
            {r.title}
            {r.status === "OBSOLETE" && <SupersessionMark />}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        width: 130,
        accessor: (r) => requirementStatusLabel(r.status),
        cell: (r) => <RequirementStatusBadge status={r.status} />,
      },
      {
        id: "priority",
        header: "Priority",
        width: 110,
        accessor: (r) => r.priority,
        cell: (r) => <RequirementPriorityBadge priority={r.priority} />,
      },
      {
        id: "owner",
        header: "Owner",
        width: 160,
        accessor: (r) => r.owner?.name ?? null,
        cell: (r) => <span className="text-muted-foreground">{r.owner ? r.owner.name : "Unassigned"}</span>,
      },
      {
        id: "source",
        header: "Source",
        width: 160,
        hiddenByDefault: true,
        accessor: (r) => r.source,
        cell: (r) => <span className="text-muted-foreground">{r.source ?? "—"}</span>,
      },
      {
        id: "updatedAt",
        header: "Updated",
        width: 110,
        numeric: true,
        accessor: (r) => r.updatedAt,
        cell: (r) => (
          <span className="text-muted-foreground" title={r.updatedAt}>
            {formatIsoDate(r.updatedAt)}
          </span>
        ),
      },
      {
        id: "createdAt",
        header: "Created",
        width: 110,
        numeric: true,
        hiddenByDefault: true,
        accessor: (r) => r.createdAt,
        cell: (r) => (
          <span className="text-muted-foreground" title={r.createdAt}>
            {formatIsoDate(r.createdAt)}
          </span>
        ),
      },
    ],
    [projectId],
  );

  const grid = useDataGridState(`requirements:${projectId}`, columns);

  const chips: FilterChip[] = [];
  if (filters.status) {
    chips.push({
      key: "status",
      label: `Status: ${requirementStatusLabel(filters.status)}`,
      onRemove: () => setFilters({ status: "" }),
    });
  }
  if (filters.q) {
    chips.push({ key: "q", label: `Search: "${filters.q}"`, onRemove: () => setFilters({ q: "" }) });
  }

  const detailRow = detailId ? rows.find((r) => r.id === detailId) : undefined;

  function handleCopySelected() {
    const selected = rows.filter((r) => selectedIds.has(r.id));
    const visible = grid.columnOrder
      .map((id) => columns.find((c) => c.id === id))
      .filter((c): c is DataGridColumn<RequirementListItemDto> => c !== undefined && (c.alwaysVisible || !grid.hiddenColumns.has(c.id)));
    const text = selected
      .map((row) => visible.map((c) => String(c.accessor(row) ?? "")).join("\t"))
      .join("\n");
    void navigator.clipboard.writeText(text).catch(() => {});
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={
          projectName
            ? `Formal engineering requirements for ${projectName}.`
            : "Formal engineering requirements for this project."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New requirement
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="status-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
            Status
          </Label>
          <Select
            id="status-filter"
            className="h-8 w-48"
            value={filters.status}
            onChange={(event) => setFilters({ status: event.target.value as RequirementStatus | "" })}
          >
            <option value="">All statuses</option>
            {REQUIREMENT_STATUSES.map((value) => (
              <option key={value} value={value}>
                {requirementStatusLabel(value)}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="requirement-search" className="text-xs uppercase tracking-wide text-muted-foreground">
            Search
          </Label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              id="requirement-search"
              ref={searchInputRef}
              value={filters.q}
              onChange={(event) => setFilters({ q: event.target.value })}
              placeholder="Identifier or title… (press / to focus)"
              className="h-8 w-64 pl-8"
            />
          </div>
        </div>

        <SavedViewsControl
          views={savedViews.views}
          currentFilters={filters}
          onLoad={(loaded) => setFilters(loaded)}
          onSave={savedViews.save}
          onDelete={savedViews.remove}
        />
      </div>

      <FilterChips chips={chips} />

      {state.phase === "loading" && <LoadingState label="Loading requirements…" />}

      {state.phase === "error" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
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

      {state.phase === "ready" &&
        (allRows.length === 0 ? (
          <EmptyState
            icon={<ListChecks aria-hidden="true" />}
            title={filters.status ? "No requirements with this status" : "No requirements yet"}
            description={
              filters.status
                ? "Clear the filter to see the project's other requirements."
                : "Create the first requirement to start building this project's engineering record."
            }
            action={
              filters.status ? (
                <Button variant="outline" onClick={() => setFilters({ status: "" })}>
                  Clear filter
                </Button>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New requirement
                </Button>
              )
            }
          />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Search aria-hidden="true" />}
            title="No requirements match this search"
            description={`Nothing matches "${filters.q}". Clear the search to see the rest of this view.`}
            action={
              <Button variant="outline" onClick={() => setFilters({ q: "" })}>
                Clear search
              </Button>
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            <DataGridToolbar
              columns={columns}
              grid={grid}
              rows={rows}
              identifierAccessor={(r) => r.identifier}
              exportFilename={`requirements-${projectId}.csv`}
              selectedCount={selectedIds.size}
              onCopySelected={handleCopySelected}
            />
            <DataGrid
              storageKey={`requirements:${projectId}`}
              columns={columns}
              rows={rows}
              getRowId={(r) => r.id}
              identifierAccessor={(r) => r.identifier}
              selectable
              selectedIds={selectedIds}
              onSelectedIdsChange={setSelectedIds}
              onRowActivate={(r) => setDetailId(r.id)}
              rowClassName={(r) => (r.status === "OBSOLETE" ? SUPERSEDED_ROW_CLASS : undefined)}
              filterInputRef={searchInputRef}
            />
          </div>
        ))}

      <RequirementFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(requirement) => {
          // Refresh from the server, then open what was actually created.
          reload();
          router.push(`/projects/${projectId}/requirements/${requirement.id}`);
        }}
      />

      <Sheet open={detailRow !== undefined} onOpenChange={(open) => !open && setDetailId(null)}>
        <SheetContent>
          {detailRow && (
            <>
              <SheetHeader>
                <SheetTitle>
                  <Identifier value={detailRow.identifier} /> — {detailRow.title}
                </SheetTitle>
                <SheetDescription>Quick look. Open the full record to edit, link, or transition it.</SheetDescription>
              </SheetHeader>
              <SheetBody className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                    <RequirementStatusBadge status={detailRow.status} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Priority</span>
                    <RequirementPriorityBadge priority={detailRow.priority} />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Owner</span>
                    <span>{detailRow.owner ? detailRow.owner.name : "Unassigned"}</span>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Updated</span>
                    <span className="font-mono" title={detailRow.updatedAt}>
                      {formatIsoDate(detailRow.updatedAt)}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">Statement</span>
                  <p className="text-sm">{detailRow.statement}</p>
                </div>
                {detailRow.rationale && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Rationale</span>
                    <p className="text-sm text-muted-foreground">{detailRow.rationale}</p>
                  </div>
                )}
                <Button asChild className="mt-2 self-start">
                  <Link href={`/projects/${projectId}/requirements/${detailRow.id}`}>Open full record</Link>
                </Button>
              </SheetBody>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
