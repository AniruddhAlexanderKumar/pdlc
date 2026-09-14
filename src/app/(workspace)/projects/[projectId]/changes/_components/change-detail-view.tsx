"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Lock, Pencil } from "lucide-react";
import type { ChangeRequestStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  addDeclaredImpact,
  removeDeclaredImpact,
  transitionChangeRequest,
  useChangeRequest,
} from "@/lib/api/changes";
import { ArtifactHistory, DetailField } from "@/components/common/artifact-panels";
import { ChangeStatusBadge } from "@/components/common/change-badges";
import { PageHeader } from "@/components/common/page-header";
import { TraceLink } from "@/components/common/trace-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { ChangeFormDialog } from "./change-form-dialog";
import { DeclaredImpactsSection } from "./declared-impacts";
import { ImpactAnalysisPanel } from "./impact-analysis-panel";

const TRANSITION_LABELS: Record<ChangeRequestStatus, string> = {
  DRAFT: "Return to draft",
  SUBMITTED: "Submit",
  UNDER_REVIEW: "Begin review",
  APPROVED: "Approve",
  REJECTED: "Reject",
  IMPLEMENTED: "Mark implemented",
  CANCELLED: "Cancel change",
};

/** Transitions that end or refuse the change get a quieter treatment. */
const CAUTIOUS: ReadonlySet<ChangeRequestStatus> = new Set(["REJECTED", "CANCELLED"]);

/**
 * Change request detail.
 *
 * Answers, in order: what is changing, why, who asked, where it is in its
 * lifecycle, what it *declares* it affects, what the engine computed by walking
 * the graph, and what has been done to the record since. Declared and computed
 * impact sit in separate panels and are never merged: one is an assertion, the
 * other a derivation.
 *
 * Lifecycle controls offer only the transitions the server said are legal, and
 * the server enforces them regardless of what this renders.
 */
export function ChangeDetailView({
  projectId,
  changeId,
}: {
  projectId: string;
  changeId: string;
}) {
  const { state, reload } = useChangeRequest(projectId, changeId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading change request…" />;
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
          <Link href={`/projects/${projectId}/changes`}>
            <ArrowLeft aria-hidden="true" />
            Back to changes
          </Link>
        </Button>
      </div>
    );
  }

  const change = state.data;

  /** Runs a mutation, then re-reads so every derived flag comes from the server. */
  async function run(action: () => Promise<unknown>) {
    if (isBusy) return;
    setActionError(null);
    setIsBusy(true);

    try {
      await action();
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
        title={`${change.identifier} — ${change.title}`}
        description="Engineering change request."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/changes`}>
                <ArrowLeft aria-hidden="true" />
                All changes
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={!change.editable.definition}
              title={
                change.editable.definition
                  ? undefined
                  : "A change under review or later can no longer be edited"
              }
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/CHANGE_REQUEST/${change.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
            <TraceLink
              projectId={projectId}
              type="CHANGE_REQUEST"
              id={change.id}
              identifier={change.identifier}
              label={change.title}
            />
          </>
        }
      />

      {actionError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {!change.editable.definition && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This change has been reviewed or concluded, so its definition is fixed. A change that
            was examined must not silently become a different change — raise a new change request
            instead.
          </span>
        </p>
      )}

      {/* 1. Summary */}
      <Card>
        <CardHeader>
          <CardTitle>Change</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{change.identifier}</span>
            </DetailField>
            <DetailField term="Status">
              <ChangeStatusBadge status={change.status} />
            </DetailField>
            <DetailField term="Requester">{change.requestedBy?.name ?? "Unknown"}</DetailField>
            <DetailField term="Raised">
              <span className="font-mono">{formatIsoDate(change.createdAt)}</span>
            </DetailField>
            <DetailField term="Last updated">
              <span className="font-mono">{formatIsoDate(change.updatedAt)}</span>
            </DetailField>
          </dl>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What is changing
            </h3>
            <p className="whitespace-pre-wrap text-sm">{change.description}</p>
          </div>

          <div className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Why
            </h3>
            <p className="whitespace-pre-wrap text-sm">{change.reason}</p>
          </div>
        </CardContent>
      </Card>

      {/* 2. Lifecycle */}
      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>
            Only the transitions that are legal from the current status are offered.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          {change.availableTransitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              This change is in a final state — no further transitions are possible.
            </p>
          ) : (
            change.availableTransitions.map((next) => (
              <Button
                key={next}
                variant={CAUTIOUS.has(next) ? "outline" : "default"}
                size="sm"
                disabled={isBusy}
                onClick={() => run(() => transitionChangeRequest(projectId, change.id, next))}
              >
                {TRANSITION_LABELS[next]}
              </Button>
            ))
          )}
        </CardContent>
      </Card>

      {/* 3. What the requester says this touches */}
      <DeclaredImpactsSection
        projectId={projectId}
        impacts={change.declaredImpacts}
        editable={change.editable.declaredImpacts}
        busy={isBusy}
        onAdd={(input) =>
          run(() =>
            addDeclaredImpact(projectId, change.id, {
              target: { type: input.type, id: input.targetId },
              note: input.note,
            }),
          )
        }
        onRemove={(impactId) => run(() => removeDeclaredImpact(projectId, change.id, impactId))}
      />

      {/* 4. What the engine worked out by walking the graph */}
      <ImpactAnalysisPanel projectId={projectId} changeId={change.id} />

      {/* 5. History */}
      <ArtifactHistory events={change.history} />

      <ChangeFormDialog
        mode="edit"
        projectId={projectId}
        change={change}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}
