"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Lock, Pencil } from "lucide-react";
import type { AssumptionStatus, ComparisonOperator, DecisionStatus, ExpectationStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type DecisionLinkDto,
  addAlternative,
  addAssumption,
  assignDecisionOwner,
  clearExpectation,
  removeAlternative,
  removeAssumption,
  setExpectation,
  transitionDecision,
  updateAlternative,
  updateAssumption,
  useDecision,
} from "@/lib/api/decisions";
import { useOrganizationMembers } from "@/lib/api/requirements";
import { ArtifactHistory, DetailField, OwnerPanel } from "@/components/common/artifact-panels";
import { DecisionStatusBadge, decisionStatusLabel } from "@/components/common/decision-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { DecisionFormDialog } from "./decision-form-dialog";
import {
  AlternativesSection,
  AssumptionsSection,
  ExpectationSection,
} from "./decision-memory-sections";
import { DecisionTraceability } from "./decision-traceability";

const TRANSITION_LABELS: Record<DecisionStatus, string> = {
  PROPOSED: "Return to proposed",
  UNDER_REVIEW: "Begin review",
  APPROVED: "Approve",
  REJECTED: "Reject",
  SUPERSEDED: "Supersede",
};

/**
 * Decision detail — the decision memory interface.
 *
 * Answers, in order: what was decided, why, what else was considered, what had
 * to be true, what was expected to happen, what it touched, and what has been
 * done to the record since. Lifecycle controls offer only what the server said
 * is legal, and the server enforces it regardless.
 */
export function DecisionDetailView({
  projectId,
  decisionId,
}: {
  projectId: string;
  decisionId: string;
}) {
  const { state, set, reload } = useDecision(projectId, decisionId);
  const members = useOrganizationMembers();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading decision…" />;
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
          <Link href={`/projects/${projectId}/decisions`}>
            <ArrowLeft aria-hidden="true" />
            Back to decisions
          </Link>
        </Button>
      </div>
    );
  }

  const decision = state.data;

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

  function handleLinksChanged(links: DecisionLinkDto[]) {
    set({ ...decision, links });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${decision.identifier} — ${decision.title}`}
        description="Engineering decision record."
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/decisions`}>
                <ArrowLeft aria-hidden="true" />
                All decisions
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={!decision.editable.content}
              title={
                decision.editable.content
                  ? undefined
                  : `A ${decisionStatusLabel(decision.status).toLowerCase()} decision cannot be edited`
              }
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/ENGINEERING_DECISION/${decision.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
          </>
        }
      />

      {!decision.editable.content && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This decision is {decisionStatusLabel(decision.status).toLowerCase()} and its statement,
            rationale and alternatives are fixed. Record a new decision that supersedes it rather
            than rewriting what was agreed.
            {decision.editable.assumptions &&
              " Assumptions and the expected outcome can still be updated — that is how a decision is revisited honestly."}
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

      {/* 1. Decision */}
      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{decision.identifier}</span>
            </DetailField>
            <DetailField term="Status">
              <DecisionStatusBadge status={decision.status} />
            </DetailField>
            <DetailField term="Owner">
              {decision.owner ? decision.owner.name : "Unassigned"}
            </DetailField>
            <DetailField term="Decided">
              <span className="font-mono">{formatIsoDate(decision.decidedAt)}</span>
            </DetailField>
            <DetailField term="Created">
              <span className="font-mono" title={decision.createdAt}>
                {formatIsoDate(decision.createdAt)}
              </span>
            </DetailField>
            <DetailField term="Updated">
              <span className="font-mono" title={decision.updatedAt}>
                {formatIsoDate(decision.updatedAt)}
              </span>
            </DetailField>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              What was decided
            </h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">{decision.statement}</p>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Why
            </h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">{decision.rationale}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>
              Currently {decisionStatusLabel(decision.status).toLowerCase()}. Only valid next
              states are offered.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {decision.availableTransitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This decision is in a final state — no further transitions are possible.
              </p>
            ) : (
              decision.availableTransitions.map((next) => (
                <Button
                  key={next}
                  variant={next === "REJECTED" || next === "SUPERSEDED" ? "outline" : "default"}
                  size="sm"
                  disabled={isBusy}
                  onClick={() => run(() => transitionDecision(projectId, decision.id, next))}
                >
                  {TRANSITION_LABELS[next]}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <OwnerPanel
          ownerName={decision.owner?.name ?? null}
          ownerEmail={decision.owner?.email ?? null}
          ownerId={decision.ownerId}
          members={members.state.phase === "ready" ? members.state.data : []}
          disabled={isBusy || !decision.editable.owner || members.state.phase !== "ready"}
          onAssign={(ownerId) => run(() => assignDecisionOwner(projectId, decision.id, ownerId))}
        />
      </div>

      {/* 2. Alternatives */}
      <AlternativesSection
        alternatives={decision.alternatives}
        editable={decision.editable.content}
        busy={isBusy}
        onAdd={(input) => run(() => addAlternative(projectId, decision.id, input as never))}
        onUpdate={(id, input) =>
          run(() => updateAlternative(projectId, decision.id, id, input as never))
        }
        onRemove={(id) => run(() => removeAlternative(projectId, decision.id, id))}
      />

      {/* 3. Assumptions */}
      <AssumptionsSection
        assumptions={decision.assumptions}
        editable={decision.editable.assumptions}
        busy={isBusy}
        onAdd={(input) => run(() => addAssumption(projectId, decision.id, input as never))}
        onUpdate={(id, input: { status: AssumptionStatus }) =>
          run(() => updateAssumption(projectId, decision.id, id, input))
        }
        onRemove={(id) => run(() => removeAssumption(projectId, decision.id, id))}
      />

      {/* 4. Expected consequence */}
      <ExpectationSection
        expectation={decision.expectation}
        editable={decision.editable.assumptions}
        busy={isBusy}
        onSet={(input: {
          statement: string;
          measure: string | null;
          expectedValue: string | null;
          unit: string | null;
          comparisonOperator: ComparisonOperator | null;
          status: ExpectationStatus;
          actualValue: string | null;
        }) => run(() => setExpectation(projectId, decision.id, input as never))}
        onClear={() => run(() => clearExpectation(projectId, decision.id))}
      />

      {/* 5 & 6. Evidence and traceability */}
      <DecisionTraceability
        projectId={projectId}
        decisionId={decision.id}
        links={decision.links}
        editable={decision.editable.links}
        onLinksChanged={handleLinksChanged}
      />

      {/* 7. History */}
      <ArtifactHistory events={decision.history} />

      <DecisionFormDialog
        mode="edit"
        projectId={projectId}
        decision={decision}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}
