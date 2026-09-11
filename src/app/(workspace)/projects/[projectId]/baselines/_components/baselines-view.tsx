"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Layers, Plus, RefreshCw } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useBaselines } from "@/lib/api/drift";
import { useProject } from "@/lib/api/projects";
import { BaselineStatusBadge } from "@/components/common/drift-badges";
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
import { BaselineFormDialog } from "./baseline-form-dialog";

/**
 * Engineering baselines for one project.
 *
 * Superseded baselines are shown, never hidden: the history of what was approved
 * when is the point, and every historical drift assessment was computed against
 * one of them.
 */
export function BaselinesView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const { state, reload } = useBaselines(projectId);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Engineering baselines"
        description={
          projectName
            ? `The approved engineering basis for ${projectName}, as a reference for drift detection.`
            : "The approved engineering basis, as a reference for drift detection."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New baseline
          </Button>
        }
      />

      {state.phase === "loading" && <LoadingState label="Loading baselines…" />}

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
            icon={<Layers aria-hidden="true" />}
            title="No baselines yet"
            description="Record which engineering objects constitute your approved basis, then activate the baseline. Drift is measured against it — without one, there is nothing to compare operational reality to."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden="true" />
                New baseline
              </Button>
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Engineering baselines in this project, newest first.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Members</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Activated</TableHead>
                <TableHead>Superseded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((baseline) => (
                <TableRow key={baseline.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/baselines/${baseline.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {baseline.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{baseline.name}</TableCell>
                  <TableCell>
                    <BaselineStatusBadge status={baseline.status} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {baseline.memberCount}
                  </TableCell>
                  <TableCell
                    className="font-mono text-muted-foreground"
                    title={baseline.createdAt}
                  >
                    {formatIsoDate(baseline.createdAt)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {baseline.baselinedAt ? formatIsoDate(baseline.baselinedAt) : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {baseline.supersededAt ? formatIsoDate(baseline.supersededAt) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <BaselineFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(baseline) => {
          reload();
          router.push(`/projects/${projectId}/baselines/${baseline.id}`);
        }}
      />
    </div>
  );
}
