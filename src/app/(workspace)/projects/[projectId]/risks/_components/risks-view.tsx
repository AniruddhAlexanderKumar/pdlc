"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, RefreshCw, ShieldAlert } from "lucide-react";
import { RISK_STATUSES, type RiskStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { useRisks } from "@/lib/api/risks";
import { PageHeader } from "@/components/common/page-header";
import { RiskStatusBadge, riskStatusLabel } from "@/components/common/risk-issue-badges";
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
import { RiskFormDialog } from "./risk-form-dialog";

/**
 * Risks list for one project.
 *
 * Everything shown comes from `GET /api/projects/:id/risks`; an empty
 * project shows an empty state rather than a fabricated count. No numeric
 * risk score, no probability/impact matrix — the domain records none.
 */
export function RisksView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("risk", "Risks");
  const [status, setStatus] = React.useState<RiskStatus | "">("");
  const { state, reload } = useRisks(projectId, status);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/risks"
        title={title}
        description={
          projectName
            ? `What could go wrong on ${projectName}, why, and what is being done about it.`
            : "What could go wrong, why, and what is being done about it."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New risk
          </Button>
        }
      />

      <div className="flex items-center gap-2">
        <Label htmlFor="risk-status-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
          Status
        </Label>
        <Select
          id="risk-status-filter"
          className="h-8 w-48"
          value={status}
          onChange={(event) => setStatus(event.target.value as RiskStatus | "")}
        >
          <option value="">All statuses</option>
          {RISK_STATUSES.map((value) => (
            <option key={value} value={value}>
              {riskStatusLabel(value)}
            </option>
          ))}
        </Select>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading risks…" />}

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
            icon={<ShieldAlert aria-hidden="true" />}
            title={status ? "No risks with this status" : "No risks yet"}
            description={
              status
                ? "Clear the filter to see the project's other risks."
                : "Record the first risk to start tracking what could go wrong on this project."
            }
            action={
              status ? (
                <Button variant="outline" onClick={() => setStatus("")}>
                  Clear filter
                </Button>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New risk
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">Risks in this project, ordered by identifier.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((risk) => (
                <TableRow key={risk.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/risks/${risk.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {risk.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{risk.title}</TableCell>
                  <TableCell>
                    <RiskStatusBadge status={risk.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {risk.owner ? risk.owner.name : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={risk.updatedAt}>
                    {formatIsoDate(risk.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <RiskFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(risk) => {
          reload();
          router.push(`/projects/${projectId}/risks/${risk.id}`);
        }}
      />
    </div>
  );
}
