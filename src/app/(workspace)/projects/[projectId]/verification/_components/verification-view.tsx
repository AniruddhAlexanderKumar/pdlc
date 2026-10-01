"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, RefreshCw, ShieldCheck, X } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useVerificationActivities } from "@/lib/api/artifacts";
import { useProject } from "@/lib/api/projects";
import {
  VerificationMethodBadge,
  VerificationStatusBadge,
} from "@/components/common/artifact-badges";
import { ReadinessStatusBadge } from "@/components/common/readiness-badges";
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
import { useModuleLabel } from "../../../../_components/terminology-context";
import { VerificationFormDialog } from "./verification-form-dialog";
import { useCreateDialogState } from "@/lib/use-create-intent";
import type { PlannedCheckDto } from "@/lib/api/quick-actions";
import { MissingChecksBanner } from "./plan-checks";

/** Verification activities for one project. Everything shown comes from the API. */
export function VerificationView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const title = useModuleLabel("verificationActivity", "Verification");
  const { state, reload } = useVerificationActivities(projectId);
  const project = useProject(projectId);
  const [isCreateOpen, setIsCreateOpen] = useCreateDialogState();
  /** Bumped whenever checks change here, so "N requirements have no check yet" stays current. */
  const [refreshKey, setRefreshKey] = React.useState(0);
  const [justPlanned, setJustPlanned] = React.useState<string | null>(null);

  function handlePlanned(checks: PlannedCheckDto[]) {
    reload();
    setRefreshKey((key) => key + 1);
    const first = checks[0]?.activity.identifier;
    const last = checks[checks.length - 1]?.activity.identifier;
    setJustPlanned(
      checks.length === 1
        ? `Planned ${first} for ${checks[0]?.requirementIdentifier}. Record its result when it has been done.`
        : `Planned ${checks.length} checks, ${first} to ${last}, each linked to its requirement. Record each result when it has been done.`,
    );
  }

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/verification"
        title={title}
        description={
          projectName
            ? `How ${projectName}'s requirements will be shown to be met, and whether each activity is ready to be performed.`
            : "How this project's requirements will be shown to be met, and whether each activity is ready to be performed."
        }
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New check
          </Button>
        }
      />

      <MissingChecksBanner projectId={projectId} refreshKey={refreshKey} onPlanned={handlePlanned} />

      {justPlanned && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm text-foreground"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden="true" />
          <span className="flex-1">{justPlanned}</span>
          <button
            type="button"
            onClick={() => setJustPlanned(null)}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Dismiss"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </p>
      )}

      {state.phase === "loading" && <LoadingState label="Loading checks…" />}

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
            icon={<ShieldCheck aria-hidden="true" />}
            title="No checks planned yet"
            description="For each requirement, plan how you will show it is met — by a test, an analysis, an inspection or a demonstration."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden="true" />
                New check
              </Button>
            }
          />
        ) : (
          <Table>
            <TableCaption className="text-left">
              Verification activities in this project, ordered by identifier. &ldquo;Result&rdquo;
              is what the activity recorded when it was performed. &ldquo;Last readiness&rdquo; is
              the most recent readiness assessment <em>as it was recorded</em> — whether it still
              holds is established on the activity&apos;s own page, so nothing here is presented
              as current. Activities nobody has assessed show no readiness at all rather than a
              placeholder.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Identifier</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>Result</TableHead>
                <TableHead>Last readiness</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Planned</TableHead>
                <TableHead>Completed</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {state.data.map((activity) => (
                <TableRow key={activity.id}>
                  <TableCell className="font-mono">
                    <Link
                      href={`/projects/${projectId}/verification/${activity.id}`}
                      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {activity.identifier}
                    </Link>
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal">{activity.title}</TableCell>
                  <TableCell>
                    <VerificationMethodBadge method={activity.method} />
                  </TableCell>
                  <TableCell>
                    <VerificationStatusBadge status={activity.status} />
                  </TableCell>
                  <TableCell>
                    {activity.lastReadiness ? (
                      <span className="flex flex-wrap items-center gap-1.5">
                        <ReadinessStatusBadge status={activity.lastReadiness.status} />
                        <span
                          className="font-mono text-xs text-muted-foreground"
                          title={activity.lastReadiness.evaluatedAt}
                        >
                          {formatIsoDate(activity.lastReadiness.evaluatedAt)}
                        </span>
                      </span>
                    ) : (
                      <span className="text-sm text-muted-foreground">Not assessed</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {activity.owner ? activity.owner.name : "Unassigned"}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatIsoDate(activity.plannedDate)}
                  </TableCell>
                  <TableCell className="font-mono text-muted-foreground">
                    {formatIsoDate(activity.completedDate)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ))}

      <VerificationFormDialog
        mode="create"
        projectId={projectId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={(activity) => {
          reload();
          setRefreshKey((key) => key + 1);
          router.push(`/projects/${projectId}/verification/${activity.id}`);
        }}
      />
    </div>
  );
}
