"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ClipboardList, Plus, RefreshCw } from "lucide-react";
import type {
  ComplianceApplicability,
  ComplianceDisposition,
  ComplianceItemStatus,
} from "@/domain";
import {
  complianceApplicabilitySchema,
  complianceDispositionSchema,
  complianceItemStatusSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useBases, useItems } from "@/lib/api/certification";
import {
  ApplicabilityBadge,
  ComplianceItemStatusBadge,
  DispositionBadge,
} from "@/components/common/certification-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ItemFormDialog } from "./item-form-dialog";
import { useCreateDialogState } from "@/lib/use-create-intent";

/**
 * Compliance items under the programme's active certification basis.
 *
 * No search or pagination yet, per spec — filters by applicability, status
 * and disposition are what a certification reviewer needs first.
 */
export function ItemsView({ projectId }: { projectId: string }) {
  const bases = useBases(projectId);
  const activeBasis = bases.state.phase === "ready" ? bases.state.data.find((b) => b.status === "ACTIVE") : null;
  const items = useItems(projectId, activeBasis?.id ?? "");
  const [isCreateOpen, setIsCreateOpen] = useCreateDialogState();

  const [applicabilityFilter, setApplicabilityFilter] = React.useState<ComplianceApplicability | "">("");
  const [statusFilter, setStatusFilter] = React.useState<ComplianceItemStatus | "">("");
  const [dispositionFilter, setDispositionFilter] = React.useState<ComplianceDisposition | "">("");

  const filtered =
    items.state.phase === "ready"
      ? items.state.data.filter(
          (item) =>
            (!applicabilityFilter || item.applicability === applicabilityFilter) &&
            (!statusFilter || item.status === statusFilter) &&
            (!dispositionFilter || item.disposition === dispositionFilter),
        )
      : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Compliance items"
        description="Certification obligations tracked against the active certification basis."
        actions={
          <Button onClick={() => setIsCreateOpen(true)} disabled={!activeBasis}>
            <Plus aria-hidden="true" />
            New compliance item
          </Button>
        }
      />

      {bases.state.phase === "ready" && !activeBasis && (
        <EmptyState
          icon={<AlertTriangle aria-hidden="true" />}
          title="No active certification basis"
          description="Activate a certification basis before recording compliance items against it."
          action={
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/certification`}>Go to certification workspace</Link>
            </Button>
          }
        />
      )}

      {activeBasis && (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Applicability</span>
              <Select
                value={applicabilityFilter}
                onChange={(event) => setApplicabilityFilter(event.target.value as ComplianceApplicability | "")}
              >
                <option value="">All</option>
                {complianceApplicabilitySchema.options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Status</span>
              <Select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as ComplianceItemStatus | "")}>
                <option value="">All</option>
                {complianceItemStatusSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Disposition</span>
              <Select
                value={dispositionFilter}
                onChange={(event) => setDispositionFilter(event.target.value as ComplianceDisposition | "")}
              >
                <option value="">All</option>
                {complianceDispositionSchema.options.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </Select>
            </label>
            <Button variant="outline" size="sm" onClick={items.reload}>
              <RefreshCw aria-hidden="true" />
              Refresh
            </Button>
          </div>

          {items.state.phase === "loading" && <LoadingState label="Loading compliance items…" />}

          {items.state.phase === "error" && (
            <EmptyState
              icon={<AlertTriangle aria-hidden="true" />}
              title="Could not load compliance items"
              description={describeApiError(items.state.error)}
              action={<Button onClick={items.reload}>Retry</Button>}
            />
          )}

          {items.state.phase === "ready" && filtered.length === 0 && (
            <EmptyState
              icon={<ClipboardList aria-hidden="true" />}
              title="No compliance items match"
              description="Adjust the filters, or record the first compliance item against this basis."
            />
          )}

          {items.state.phase === "ready" && filtered.length > 0 && (
            <Card>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Identifier</TableHead>
                      <TableHead>Title</TableHead>
                      <TableHead>Applicability</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Disposition</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Findings</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <Link
                            className="font-mono text-xs underline-offset-2 hover:underline"
                            href={`/projects/${projectId}/certification/items/${item.id}`}
                          >
                            {item.identifier}
                          </Link>
                        </TableCell>
                        <TableCell>{item.title}</TableCell>
                        <TableCell>
                          <ApplicabilityBadge applicability={item.applicability} />
                        </TableCell>
                        <TableCell>
                          <ComplianceItemStatusBadge status={item.status} />
                        </TableCell>
                        <TableCell>
                          <DispositionBadge disposition={item.disposition} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-xs">{item.method ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{item._count.findings}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </>
      )}

      {activeBasis && (
        <ItemFormDialog
          projectId={projectId}
          basisId={activeBasis.id}
          open={isCreateOpen}
          onOpenChange={setIsCreateOpen}
          onSaved={() => items.reload()}
        />
      )}
    </div>
  );
}
