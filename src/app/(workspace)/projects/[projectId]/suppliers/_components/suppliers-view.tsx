"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Factory, Plus, RefreshCw } from "lucide-react";
import { canWriteProject, SUPPLIER_STATUSES, type SupplierStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useMyProjectAccess } from "@/lib/api/project-membership";
import { useProject } from "@/lib/api/projects";
import { useSuppliers } from "@/lib/api/suppliers";
import { PageHeader } from "@/components/common/page-header";
import { SupplierStatusBadge, supplierLabel } from "@/components/common/supplier-badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/utils";
import { useModuleLabel } from "../../../../_components/terminology-context";
import { SupplierFormDialog } from "./supplier-form-dialog";

/**
 * Suppliers for one project.
 *
 * The supplied-item count is a real aggregate returned by the list endpoint in
 * the same query — it is shown because it is genuinely derived, not estimated.
 */
export function SuppliersView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("supplier", "Suppliers");
  const [status, setStatus] = React.useState<SupplierStatus | "">("");
  const { state, reload } = useSuppliers(projectId, status);
  const project = useProject(projectId);
  const access = useMyProjectAccess(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  // Convenience only — the server re-derives and enforces this on every
  // write regardless of what this hides.
  const canWrite = access.state.phase === "ready" && canWriteProject(access.state.data.role);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={title}
        description={
          projectName
            ? `Supplier engineering dependencies for ${projectName}. Not a procurement record.`
            : "Supplier engineering dependencies. Not a procurement record."
        }
        actions={
          canWrite && (
            <Button onClick={() => setIsCreateOpen(true)}>
              <Plus aria-hidden="true" />
              New supplier
            </Button>
          )
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="supplier-status-filter"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Status
          </label>
          <Select
            id="supplier-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as SupplierStatus | "")}
            className="w-56"
          >
            <option value="">All statuses</option>
            {SUPPLIER_STATUSES.map((value) => (
              <option key={value} value={value}>
                {supplierLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading suppliers…" />}

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
        (state.data.length === 0 ? (
          <EmptyState
            icon={<Factory aria-hidden="true" />}
            title={status ? "No suppliers with that status" : "No suppliers yet"}
            description="Record the external organizations this project's engineering depends on, then add what each of them supplies."
            action={
              canWrite ? (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New supplier
                </Button>
              ) : undefined
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Suppliers in this project, ordered by identifier.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Supplied items</TableHead>
                <TableHead>Qualifications</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((supplier) => (
                <TableRow key={supplier.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/suppliers/${supplier.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {supplier.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{supplier.name}</TableCell>
                  <TableCell>
                    <SupplierStatusBadge status={supplier.status} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {supplier.suppliedItemCount}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {supplier.qualificationCount}
                  </TableCell>
                  <TableCell
                    className="font-mono text-muted-foreground"
                    title={supplier.updatedAt}
                  >
                    {formatIsoDate(supplier.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <SupplierFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(supplier) => {
          reload();
          router.push(`/projects/${projectId}/suppliers/${supplier.id}`);
        }}
      />
    </div>
  );
}
