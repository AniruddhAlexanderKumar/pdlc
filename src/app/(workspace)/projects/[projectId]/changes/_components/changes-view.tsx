"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, GitBranch, Plus, RefreshCw } from "lucide-react";
import { CHANGE_REQUEST_STATUSES, type ChangeRequestStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useChangeRequests } from "@/lib/api/changes";
import { useProject } from "@/lib/api/projects";
import { ChangeStatusBadge, changeStatusLabel } from "@/components/common/change-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
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
import { ChangeFormDialog } from "./change-form-dialog";
import { useCreateDialogState } from "@/lib/use-create-intent";

/** Change requests for one project. Everything shown comes from the API. */
export function ChangesView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("changeRequest", "Changes");
  const [status, setStatus] = React.useState<ChangeRequestStatus | "">("");
  const { state, reload } = useChangeRequests(projectId, status);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = useCreateDialogState();

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/changes"
        title={title}
        description={
          projectName
            ? `Proposed engineering changes for ${projectName}, and what each one declares it affects.`
            : "Proposed engineering changes, and what each one declares it affects."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New change
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Label
          htmlFor="change-status-filter"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Status
        </Label>
        <Select
          id="change-status-filter"
          className="h-8 w-48"
          value={status}
          onChange={(event) => setStatus(event.target.value as ChangeRequestStatus | "")}
        >
          <option value="">All statuses</option>
          {CHANGE_REQUEST_STATUSES.map((value) => (
            <option key={value} value={value}>
              {changeStatusLabel(value)}
            </option>
          ))}
        </Select>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading changes…" />}

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
            icon={<GitBranch aria-hidden="true" />}
            title={status ? "No changes with this status" : "No change requests raised yet"}
            description={
              status
                ? "Clear the filter to see the project's other change requests."
                : "Raise a change request when something in the engineering baseline needs to alter."
            }
            action={
              status ? (
                <Button variant="outline" onClick={() => setStatus("")}>
                  Clear filter
                </Button>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New change
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Change requests in this project, most recently raised first.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Requester</TableHead>
                <TableHead>Raised</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((change) => (
                <TableRow key={change.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/changes/${change.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {change.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{change.title}</TableCell>
                  <TableCell>
                    <ChangeStatusBadge status={change.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {change.requestedBy ? change.requestedBy.name : "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={change.createdAt}>
                    {formatIsoDate(change.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={change.updatedAt}>
                    {formatIsoDate(change.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <ChangeFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(change) => {
          reload();
          router.push(`/projects/${projectId}/changes/${change.id}`);
        }}
      />
    </div>
  );
}
