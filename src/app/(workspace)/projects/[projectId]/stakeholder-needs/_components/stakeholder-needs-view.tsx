"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, Users } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useStakeholderNeeds } from "@/lib/api/artifacts";
import { useProject } from "@/lib/api/projects";
import { StakeholderNeedStatusBadge } from "@/components/common/artifact-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
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
import { StakeholderNeedFormDialog } from "./stakeholder-need-form-dialog";

/** Stakeholder needs for one project. Everything shown comes from the API. */
export function StakeholderNeedsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { state, reload } = useStakeholderNeeds(projectId);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Stakeholder needs"
        description={
          projectName
            ? `Originating needs for ${projectName}. Requirements derive from these.`
            : "Originating needs. Requirements derive from these."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New stakeholder need
          </Button>
        }
      />

      {state.phase === "loading" && <LoadingState label="Loading stakeholder needs…" />}

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
            icon={<Users aria-hidden="true" />}
            title="No stakeholder needs yet"
            description="Capture the originating needs first — requirements can then be traced back to them."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden="true" />
                New stakeholder need
              </Button>
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Stakeholder needs in this project, ordered by identifier.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Stakeholder</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((need) => (
                <TableRow key={need.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/stakeholder-needs/${need.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {need.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{need.title}</TableCell>
                  <TableCell className="text-muted-foreground">{need.stakeholder}</TableCell>
                  <TableCell>
                    <StakeholderNeedStatusBadge status={need.status} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={need.updatedAt}>
                    {formatIsoDate(need.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <StakeholderNeedFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(need) => {
          reload();
          router.push(`/projects/${projectId}/stakeholder-needs/${need.id}`);
        }}
      />
    </div>
  );
}
