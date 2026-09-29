"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, Plus, RefreshCw } from "lucide-react";
import { EVIDENCE_STATUSES, EVIDENCE_TYPES, type EvidenceStatus, type EvidenceType, evidenceTypeLabel } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { useEvidenceList } from "@/lib/api/evidence";
import { PageHeader } from "@/components/common/page-header";
import { EvidenceStatusBadge } from "@/components/common/evidence-badges";
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
import { EvidenceFormDialog } from "./evidence-form-dialog";

const STATUS_LABELS: Record<EvidenceStatus, string> = {
  DRAFT: "Draft",
  VALIDATED: "Validated",
  SUPERSEDED: "Superseded",
};

/**
 * Evidence list for one project.
 *
 * Everything shown comes from `GET /api/projects/:id/evidence`; an empty
 * project shows an empty state rather than a fabricated count. There is no
 * upload button here — evidence is a record and a reference, never a stored
 * file.
 */
export function EvidenceView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("evidence", "Evidence");
  const [status, setStatus] = React.useState<EvidenceStatus | "">("");
  const [evidenceType, setEvidenceType] = React.useState<EvidenceType | "">("");
  const { state, reload } = useEvidenceList(projectId, status, evidenceType);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const hasFilter = status !== "" || evidenceType !== "";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/evidence"
        title={title}
        description={
          projectName
            ? `Controlled engineering evidence for ${projectName}.`
            : "Controlled engineering evidence for this project."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Record evidence
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Label htmlFor="evidence-status-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
            Status
          </Label>
          <Select
            id="evidence-status-filter"
            className="h-8 w-40"
            value={status}
            onChange={(event) => setStatus(event.target.value as EvidenceStatus | "")}
          >
            <option value="">All statuses</option>
            {EVIDENCE_STATUSES.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABELS[value]}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <Label htmlFor="evidence-type-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
            Type
          </Label>
          <Select
            id="evidence-type-filter"
            className="h-8 w-48"
            value={evidenceType}
            onChange={(event) => setEvidenceType(event.target.value as EvidenceType | "")}
          >
            <option value="">All types</option>
            {EVIDENCE_TYPES.map((value) => (
              <option key={value} value={value}>
                {evidenceTypeLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {state.phase === "loading" && <LoadingState label="Loading evidence…" />}

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
            icon={<FileText aria-hidden="true" />}
            title={hasFilter ? "No evidence matches this filter" : "No evidence recorded yet"}
            description={
              hasFilter
                ? "Clear the filters to see the project's other evidence."
                : "Record the first piece of evidence to start building this project's traceable basis."
            }
            action={
              hasFilter ? (
                <Button
                  variant="outline"
                  onClick={() => {
                    setStatus("");
                    setEvidenceType("");
                  }}
                >
                  Clear filters
                </Button>
              ) : (
                <Button onClick={() => setIsCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  Record evidence
                </Button>
              )
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">Evidence in this project, ordered by identifier.</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((evidence) => (
                <TableRow key={evidence.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/evidence/${evidence.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {evidence.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{evidence.title}</TableCell>
                  <TableCell className="text-muted-foreground">{evidenceTypeLabel(evidence.evidenceType)}</TableCell>
                  <TableCell>
                    <EvidenceStatusBadge status={evidence.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {evidence.recordedBy ? evidence.recordedBy.name : "Unknown"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground" title={evidence.updatedAt}>
                    {formatIsoDate(evidence.updatedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <EvidenceFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(evidence) => {
          reload();
          router.push(`/projects/${projectId}/evidence/${evidence.id}`);
        }}
      />
    </div>
  );
}
