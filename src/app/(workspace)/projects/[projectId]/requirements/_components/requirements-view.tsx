"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ListChecks, Plus, RefreshCw } from "lucide-react";
import { REQUIREMENT_STATUSES, type RequirementStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { useRequirements } from "@/lib/api/requirements";
import { PageHeader } from "@/components/common/page-header";
import {
  RequirementPriorityBadge,
  RequirementStatusBadge,
  requirementStatusLabel,
} from "@/components/common/requirement-badges";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Label } from "@/components/ui/label";
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
import { RequirementFormDialog } from "./requirement-form-dialog";

/**
 * Requirements list for one project.
 *
 * Everything shown comes from `GET /api/projects/:id/requirements`; an empty
 * project shows an empty state rather than a fabricated count.
 */
export function RequirementsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<RequirementStatus | "">("");
  const { state, reload } = useRequirements(projectId, status);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Requirements"
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

      <div className="flex items-center gap-2">
        <Label htmlFor="status-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
          Status
        </Label>
        <Select
          id="status-filter"
          className="h-8 w-48"
          value={status}
          onChange={(event) => setStatus(event.target.value as RequirementStatus | "")}
        >
          <option value="">All statuses</option>
          {REQUIREMENT_STATUSES.map((value) => (
            <option key={value} value={value}>
              {requirementStatusLabel(value)}
            </option>
          ))}
        </Select>
      </div>

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
        (state.data.length === 0 ? (
          <EmptyState
            icon={<ListChecks aria-hidden="true" />}
            title={status ? "No requirements with this status" : "No requirements yet"}
            description={
              status
                ? "Clear the filter to see the project's other requirements."
                : "Create the first requirement to start building this project's engineering record."
            }
            action={
              status ? (
                <Button variant="outline" onClick={() => setStatus("")}>
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
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Requirements in this project, ordered by identifier.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((requirement) => (
                <TableRow key={requirement.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/requirements/${requirement.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {requirement.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{requirement.title}</TableCell>
                  <TableCell>
                    <RequirementStatusBadge status={requirement.status} />
                  </TableCell>
                  <TableCell>
                    <RequirementPriorityBadge priority={requirement.priority} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {requirement.owner ? requirement.owner.name : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={requirement.updatedAt}>
                    {formatIsoDate(requirement.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
    </div>
  );
}
