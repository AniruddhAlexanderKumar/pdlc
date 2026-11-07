"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Lock, Pencil } from "lucide-react";
import type { VerificationStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  assignVerificationOwner,
  transitionVerificationActivity,
  useVerificationActivity,
} from "@/lib/api/artifacts";
import { useOrganizationMembers } from "@/lib/api/requirements";
import {
  VerificationMethodBadge,
  VerificationStatusBadge,
  artifactLabel,
} from "@/components/common/artifact-badges";
import {
  ArtifactHistory,
  DetailField,
  LinkedRequirements,
  OwnerPanel,
} from "@/components/common/artifact-panels";
import { PageHeader } from "@/components/common/page-header";
import { TraceLink } from "@/components/common/trace-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { VerificationEvidencePanel } from "./verification-evidence-panel";
import { VerificationFormDialog } from "./verification-form-dialog";
import { VerificationReadinessPanel } from "./verification-readiness-panel";

const TRANSITION_LABELS: Record<VerificationStatus, string> = {
  PLANNED: "Return to planned",
  IN_PROGRESS: "Start",
  PASSED: "Record pass",
  FAILED: "Record failure",
  WAIVED: "Waive",
};

/**
 * Verification activity detail.
 *
 * Lifecycle controls offer only what the server said is legal, and an outcome
 * is final: once recorded, the activity is read-only and re-verification means
 * planning a new one.
 */
export function VerificationDetailView({
  projectId,
  activityId,
}: {
  projectId: string;
  activityId: string;
}) {
  const { state, reload } = useVerificationActivity(projectId, activityId);
  const members = useOrganizationMembers();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading verification activity…" />;
  }

  if (state.phase === "error") {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{describeApiError(state.error)}</span>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/projects/${projectId}/verification`}>
            <ArrowLeft aria-hidden="true" />
            Back to verification
          </Link>
        </Button>
      </div>
    );
  }

  const activity = state.data;

  async function runAction(action: () => Promise<unknown>) {
    if (isBusy) return;
    setActionError(null);
    setIsBusy(true);

    try {
      await action();
      // Re-read so status, editability and available transitions all come back
      // from the server together.
      reload();
    } catch (error) {
      setActionError(describeApiError(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${activity.identifier} — ${activity.title}`}
        description={activity.description ?? "No description."}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/verification`}>
                <ArrowLeft aria-hidden="true" />
                All activities
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={!activity.editable}
              title={activity.editable ? undefined : "Concluded activities are read-only"}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/VERIFICATION_ACTIVITY/${activity.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
            <TraceLink
              projectId={projectId}
              type="VERIFICATION_ACTIVITY"
              id={activity.id}
              identifier={activity.identifier}
              label={activity.title}
            />
          </>
        }
      />

      {!activity.editable && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This activity is {artifactLabel(activity.status).toLowerCase()} — a recorded outcome is
            final. Plan a new activity to re-verify.
          </span>
        </p>
      )}

      {actionError && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Activity</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{activity.identifier}</span>
            </DetailField>
            <DetailField term="Method">
              <VerificationMethodBadge method={activity.method} />
            </DetailField>
            <DetailField term="Status">
              <VerificationStatusBadge status={activity.status} />
            </DetailField>
            <DetailField term="Owner">
              {activity.owner ? activity.owner.name : "Unassigned"}
            </DetailField>
            <DetailField term="Planned date">
              <span className="font-mono">{formatIsoDate(activity.plannedDate)}</span>
            </DetailField>
            <DetailField term="Completed date">
              <span className="font-mono">{formatIsoDate(activity.completedDate)}</span>
            </DetailField>
            <DetailField term="Created">
              <span className="font-mono" title={activity.createdAt}>
                {formatIsoDate(activity.createdAt)}
              </span>
            </DetailField>
            <DetailField term="Updated">
              <span className="font-mono" title={activity.updatedAt}>
                {formatIsoDate(activity.updatedAt)}
              </span>
            </DetailField>
          </dl>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle and result</CardTitle>
            <CardDescription>
              Currently {artifactLabel(activity.status).toLowerCase()}. This records what happened
              when the verification was performed; whether it can responsibly be performed at all
              is the separate readiness question below. Only valid next states are offered.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {activity.availableTransitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This activity has concluded — no further transitions are possible.
              </p>
            ) : (
              activity.availableTransitions.map((next) => (
                <Button
                  key={next}
                  variant={next === "FAILED" || next === "WAIVED" ? "outline" : "default"}
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    runAction(() => transitionVerificationActivity(projectId, activity.id, next))
                  }
                >
                  {TRANSITION_LABELS[next]}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <OwnerPanel
          ownerName={activity.owner?.name ?? null}
          ownerEmail={activity.owner?.email ?? null}
          ownerId={activity.ownerId}
          members={members.state.phase === "ready" ? members.state.data : []}
          disabled={isBusy || members.state.phase !== "ready"}
          onAssign={(ownerId) =>
            runAction(() => assignVerificationOwner(projectId, activity.id, ownerId))
          }
        />
      </div>

      <LinkedRequirements
        projectId={projectId}
        requirements={activity.requirements}
        emptyMessage="No requirements are verified by this activity yet. Link one from a requirement's traceability panel."
      />

      <VerificationReadinessPanel projectId={projectId} activityId={activity.id} />

      <VerificationEvidencePanel
        projectId={projectId}
        activityId={activity.id}
        evidence={activity.evidence}
        onChanged={reload}
      />

      <ArtifactHistory events={activity.history} />

      <VerificationFormDialog
        mode="edit"
        projectId={projectId}
        activity={activity}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}
