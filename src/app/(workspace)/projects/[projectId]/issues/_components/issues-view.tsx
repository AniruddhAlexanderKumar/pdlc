"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CircleAlert, Plus, RefreshCw } from "lucide-react";
import { ISSUE_SEVERITIES, ISSUE_STATUSES, type IssueSeverity, type IssueStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { useIssues } from "@/lib/api/issues";
import { PageHeader } from "@/components/common/page-header";
import {
  IssueSeverityBadge,
  IssueStatusBadge,
  issueSeverityLabel,
  issueStatusLabel,
} from "@/components/common/risk-issue-badges";
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
import { useModuleLabel } from "../../../../_components/terminology-context";
import { IssueFormDialog } from "./issue-form-dialog";
import { useCreateDialogState } from "@/lib/use-create-intent";

/**
 * Issues list for one project.
 *
 * Everything shown comes from `GET /api/projects/:id/issues`; an empty
 * project shows an empty state rather than a fabricated count. No artificial
 * priority score — severity is exactly what a person recorded.
 */
export function IssuesView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("issue", "Issues");
  const [status, setStatus] = React.useState<IssueStatus | "">("");
  const [severity, setSeverity] = React.useState<IssueSeverity | "">("");
  const { state, reload } = useIssues(projectId, status, severity);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = useCreateDialogState();

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const filtered = status !== "" || severity !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/issues"
        title={title}
        description={
          projectName
            ? `Problems actually found on ${projectName}, their owners, and their disposition.`
            : "Problems actually found, their owners, and their disposition."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New issue
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="issue-status-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
            Status
          </Label>
          <Select
            id="issue-status-filter"
            className="h-8 w-44"
            value={status}
            onChange={(event) => setStatus(event.target.value as IssueStatus | "")}
          >
            <option value="">All statuses</option>
            {ISSUE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {issueStatusLabel(value)}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="issue-severity-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
            Severity
          </Label>
          <Select
            id="issue-severity-filter"
            className="h-8 w-40"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as IssueSeverity | "")}
          >
            <option value="">All severities</option>
            {ISSUE_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {issueSeverityLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading issues…" />}

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
            icon={<CircleAlert aria-hidden="true" />}
            title={filtered ? "No issues match these filters" : "No issues yet"}
            description={
              filtered
                ? "Clear the filters to see the project's other issues."
                : "Record the first issue to start tracking what has actually gone wrong on this project."
            }
            action={
              filtered ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus("");
                    setSeverity("");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New issue
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">Issues in this project, ordered by identifier.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((issue) => (
                <TableRow key={issue.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/issues/${issue.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {issue.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{issue.title}</TableCell>
                  <TableCell>
                    <IssueSeverityBadge severity={issue.severity} />
                  </TableCell>
                  <TableCell>
                    <IssueStatusBadge status={issue.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {issue.owner ? issue.owner.name : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={issue.updatedAt}>
                    {formatIsoDate(issue.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <IssueFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(issue) => {
          reload();
          router.push(`/projects/${projectId}/issues/${issue.id}`);
        }}
      />
    </div>
  );
}
