"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, Scale } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { DECISION_STATUSES, type DecisionStatus } from "@/domain";
import { useDecisions } from "@/lib/api/decisions";
import { useProject } from "@/lib/api/projects";
import { DecisionStatusBadge, decisionStatusLabel } from "@/components/common/decision-badges";
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
import { DecisionFormDialog } from "./decision-form-dialog";

/** Decisions for one project. Everything shown comes from the API. */
export function DecisionsView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [status, setStatus] = React.useState<DecisionStatus | "">("");
  const { state, reload } = useDecisions(projectId, status);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Decisions"
        description={
          projectName
            ? `Engineering decisions for ${projectName}, with the reasoning behind them.`
            : "Engineering decisions, with the reasoning behind them."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New decision
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Label
          htmlFor="decision-status-filter"
          className="text-xs uppercase tracking-wide text-muted-foreground"
        >
          Status
        </Label>
        <Select
          id="decision-status-filter"
          className="h-8 w-48"
          value={status}
          onChange={(event) => setStatus(event.target.value as DecisionStatus | "")}
        >
          <option value="">All statuses</option>
          {DECISION_STATUSES.map((value) => (
            <option key={value} value={value}>
              {decisionStatusLabel(value)}
            </option>
          ))}
        </Select>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading decisions…" />}

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
            icon={<Scale aria-hidden="true" />}
            title={status ? "No decisions with this status" : "No decisions recorded yet"}
            description={
              status
                ? "Clear the filter to see the project's other decisions."
                : "Record the first decision so the reasoning behind it survives the people who made it."
            }
            action={
              status ? (
                <Button variant="outline" onClick={() => setStatus("")}>
                  Clear filter
                </Button>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New decision
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Engineering decisions in this project, ordered by identifier.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Decided</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((decision) => (
                <TableRow key={decision.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/decisions/${decision.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {decision.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{decision.title}</TableCell>
                  <TableCell>
                    <DecisionStatusBadge status={decision.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {decision.owner ? decision.owner.name : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatIsoDate(decision.decidedAt)}
                  </TableCell>
                  <TableCell
                    className="font-mono text-muted-foreground"
                    title={decision.updatedAt}
                  >
                    {formatIsoDate(decision.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <DecisionFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(decision) => {
          reload();
          router.push(`/projects/${projectId}/decisions/${decision.id}`);
        }}
      />
    </div>
  );
}
