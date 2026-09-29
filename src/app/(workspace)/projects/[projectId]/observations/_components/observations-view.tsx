"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Pencil, Plus, RefreshCw, Radar, XCircle } from "lucide-react";
import { OBSERVATION_STATUSES, type ObservationStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type ObservationDto,
  rejectObservation,
  reviewObservation,
  useObservations,
} from "@/lib/api/drift";
import { useProject } from "@/lib/api/projects";
import {
  ObservationStatusBadge,
  ObservationTypeBadge,
  driftLabel,
} from "@/components/common/drift-badges";
import { PageHeader } from "@/components/common/page-header";
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
import { ObservationFormDialog } from "./observation-form-dialog";

/**
 * Operational observations for one project.
 *
 * The review/reject actions are the gate between "somebody wrote this down" and
 * "an engineer accepts this as a record of what happened". Only reviewed
 * observations are compared by the drift engine, and the page says so.
 */
export function ObservationsView({ projectId }: { projectId: string }) {
  const title = useModuleLabel("observation", "Operational observations");
  const [status, setStatus] = React.useState<ObservationStatus | "">("");
  const { state, reload } = useObservations(projectId, status);
  const project = useProject(projectId);

  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ObservationDto | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/observations"
        title={title}
        description={
          projectName
            ? `What has actually been observed in operation for ${projectName}. Recorded by people — there is no telemetry ingestion.`
            : "What has actually been observed in operation. Recorded by people — there is no telemetry ingestion."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            Record observation
          </Button>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="observation-status-filter"
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
          >
            Status
          </label>
          <Select
            id="observation-status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value as ObservationStatus | "")}
            className="w-56"
          >
            <option value="">All statuses</option>
            {OBSERVATION_STATUSES.map((value) => (
              <option key={value} value={value}>
                {driftLabel(value)}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {state.phase === "loading" && <LoadingState label="Loading observations…" />}

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
            icon={<Radar aria-hidden="true" />}
            title={status ? "No observations with that status" : "No observations yet"}
            description="Record what has been measured, inspected or reported in operation. Drift compares reviewed observations against the approved engineering basis."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden="true" />
                Record observation
              </Button>
            }
          />
        ) : (
          <Table>
            <TableCaption className="sr-only">
              Operational observations in this project, most recently observed first.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Value</TableHead>
                <TableHead>Observed</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((observation) => (
                <TableRow key={observation.id}>
                  <TableCell className="font-mono">{observation.identifier}</TableCell>
                  <TableCell className="max-w-sm whitespace-normal">
                    {observation.title}
                  </TableCell>
                  <TableCell>
                    <ObservationTypeBadge observationType={observation.observationType} />
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {observation.numericValue !== null
                      ? `${observation.numericValue}${observation.unit ? ` ${observation.unit}` : ""}`
                      : (observation.textValue ?? "—")}
                  </TableCell>
                  <TableCell
                    className="font-mono text-muted-foreground"
                    title={observation.observedAt}
                  >
                    {formatIsoDate(observation.observedAt)}
                  </TableCell>
                  <TableCell>
                    <ObservationStatusBadge status={observation.status} />
                  </TableCell>
                  <TableCell>
                    {observation.status === "RECORDED" ? (
                      <div className="flex flex-wrap gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => setEditing(observation)}
                        >
                          <Pencil aria-hidden="true" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => run(() => reviewObservation(projectId, observation.id))}
                        >
                          <CheckCircle2 aria-hidden="true" />
                          Review
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => run(() => rejectObservation(projectId, observation.id))}
                        >
                          <XCircle aria-hidden="true" />
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {observation.status === "REVIEWED"
                          ? "Accepted as a record; content is now fixed."
                          : "Not accepted; kept as history."}
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <ObservationFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={() => reload()}
      />

      {editing && (
        <ObservationFormDialog
          mode="edit"
          projectId={projectId}
          observation={editing}
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
        />
      )}
    </div>
  );
}
