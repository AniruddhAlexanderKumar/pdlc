"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Lock, Pencil } from "lucide-react";
import type { RequirementStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import {
  type RequirementLinkDto,
  assignRequirementOwner,
  transitionRequirement,
  useOrganizationMembers,
  useRequirement,
} from "@/lib/api/requirements";
import { PageHeader } from "@/components/common/page-header";
import {
  RequirementPriorityBadge,
  RequirementStatusBadge,
  requirementStatusLabel,
} from "@/components/common/requirement-badges";
import { TraceLink } from "@/components/common/trace-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";
import { RequirementFormDialog } from "./requirement-form-dialog";
import { RequirementTraceability } from "./requirement-traceability";

/** Human wording for the audit actions this module writes. */
const HISTORY_LABELS: Record<string, string> = {
  "requirement.created": "Created",
  "requirement.updated": "Content updated",
  "requirement.status_transitioned": "Status changed",
  "requirement.owner_assigned": "Owner assigned",
  "requirement.owner_cleared": "Owner cleared",
  "requirement.link_added": "Traceability link added",
  "requirement.link_removed": "Traceability link removed",
};

const TRANSITION_LABELS: Record<RequirementStatus, string> = {
  DRAFT: "Return to draft",
  IN_REVIEW: "Move to in review",
  APPROVED: "Approve",
  BASELINED: "Baseline",
  OBSOLETE: "Mark obsolete",
};

/**
 * Requirement detail.
 *
 * Holds one authoritative copy — whatever the API last returned. Every
 * mutation replaces it with the server's response, and the lifecycle controls
 * offer only the transitions the server said are legal, so the UI cannot
 * present a move that would be rejected.
 */
export function RequirementDetailView({
  projectId,
  requirementId,
}: {
  projectId: string;
  requirementId: string;
}) {
  const { state, set, reload } = useRequirement(projectId, requirementId);
  const project = useProject(projectId);
  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading requirement…" />;
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
          <Link href={`/projects/${projectId}/requirements`}>
            <ArrowLeft aria-hidden="true" />
            Back to requirements
          </Link>
        </Button>
      </div>
    );
  }

  const requirement = state.data;

  async function runAction(action: () => Promise<unknown>) {
    if (isBusy) return;
    setActionError(null);
    setIsBusy(true);

    try {
      await action();
      // Re-read so status, editability, available transitions and history all
      // come back from the server together rather than being inferred here.
      reload();
    } catch (error) {
      setActionError(describeApiError(error));
    } finally {
      setIsBusy(false);
    }
  }

  function handleLinksChanged(links: RequirementLinkDto[]) {
    set({ ...requirement, links });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${requirement.identifier} — ${requirement.title}`}
        description={projectName ? `Requirement in ${projectName}.` : "Requirement detail."}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/requirements`}>
                <ArrowLeft aria-hidden="true" />
                All requirements
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={!requirement.editable.content}
              title={
                requirement.editable.content
                  ? undefined
                  : `A requirement in ${requirementStatusLabel(requirement.status)} cannot be edited`
              }
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/REQUIREMENT/${requirement.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
            <TraceLink
              projectId={projectId}
              type="REQUIREMENT"
              id={requirement.id}
              identifier={requirement.identifier}
              label={requirement.title}
            />
          </>
        }
      />

      {!requirement.editable.content && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This requirement is {requirementStatusLabel(requirement.status).toLowerCase()} and its
            content is read-only. Only draft and in-review requirements can be edited — the
            server enforces this regardless of what the interface offers.
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
          <CardTitle>Requirement</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail term="Identifier">
              <span className="font-mono">{requirement.identifier}</span>
            </Detail>
            <Detail term="Status">
              <RequirementStatusBadge status={requirement.status} />
            </Detail>
            <Detail term="Priority">
              <RequirementPriorityBadge priority={requirement.priority} />
            </Detail>
            <Detail term="Source">{requirement.source ?? "—"}</Detail>
            <Detail term="Created">
              <span className="font-mono" title={requirement.createdAt}>
                {formatIsoDate(requirement.createdAt)}
              </span>
            </Detail>
            <Detail term="Updated">
              <span className="font-mono" title={requirement.updatedAt}>
                {formatIsoDate(requirement.updatedAt)}
              </span>
            </Detail>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Statement
            </h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">{requirement.statement}</p>
          </div>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rationale
            </h3>
            <p className="whitespace-pre-wrap text-sm text-muted-foreground">
              {requirement.rationale ?? "No rationale recorded."}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>
              Currently {requirementStatusLabel(requirement.status).toLowerCase()}. Only valid next
              states are offered.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {requirement.availableTransitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This requirement is in a final state — no further transitions are possible.
              </p>
            ) : (
              requirement.availableTransitions.map((next) => (
                <Button
                  key={next}
                  variant={next === "OBSOLETE" ? "outline" : "default"}
                  size="sm"
                  disabled={isBusy}
                  onClick={() =>
                    runAction(() => transitionRequirement(projectId, requirement.id, next))
                  }
                >
                  {TRANSITION_LABELS[next]}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <OwnerCard
          requirementOwnerId={requirement.ownerId}
          ownerName={requirement.owner?.name ?? null}
          ownerEmail={requirement.owner?.email ?? null}
          editable={requirement.editable.owner}
          disabled={isBusy}
          onAssign={(ownerId) =>
            runAction(() => assignRequirementOwner(projectId, requirement.id, ownerId))
          }
        />
      </div>

      <RequirementTraceability
        projectId={projectId}
        requirementId={requirement.id}
        links={requirement.links}
        editable={requirement.editable.links}
        onLinksChanged={handleLinksChanged}
      />

      <VerifiedBy projectId={projectId} links={requirement.links} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            History
          </CardTitle>
          <CardDescription>Audit events recorded against this requirement.</CardDescription>
        </CardHeader>
        <CardContent>
          {requirement.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {requirement.history.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm text-foreground">
                      {HISTORY_LABELS[event.action] ?? event.action}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {event.actor ? event.actor.name : "System"}
                    </span>
                  </div>
                  <span
                    className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground"
                    title={event.createdAt}
                  >
                    {formatIsoDate(event.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <RequirementFormDialog
        mode="edit"
        projectId={projectId}
        requirement={requirement}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}

/**
 * The verification activities that verify this requirement.
 *
 * Read entirely from the traceability links the page already loaded, so it adds
 * no request and cannot become an N+1.
 *
 * There is deliberately **no readiness indicator here.** Whether an assessment
 * still holds can only be established by re-resolving that activity's
 * engineering basis, which would mean one such resolution per row; showing the
 * last stored verdict without it would present a possibly-stale assessment as
 * current, which is exactly what the readiness engine exists not to do. Each
 * activity's own page answers the question honestly.
 */
function VerifiedBy({
  projectId,
  links,
}: {
  projectId: string;
  links: RequirementLinkDto[];
}) {
  const activities = links.filter((link) => link.relation === "VERIFICATION_ACTIVITY");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verified by</CardTitle>
        <CardDescription>
          Activities that demonstrate this requirement is met. Open one to evaluate whether it is
          ready to be executed.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No verification activity is linked to this requirement yet. Nothing currently
            demonstrates that it is met.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {activities.map((activity) => (
              <li key={activity.targetId} className="flex items-center justify-between gap-3 py-2.5">
                <Link
                  href={`/projects/${projectId}/verification/${activity.targetId}`}
                  className="min-w-0 truncate text-sm text-foreground underline-offset-4 hover:underline"
                >
                  <span className="font-mono">{activity.identifier}</span> — {activity.title}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function OwnerCard({
  requirementOwnerId,
  ownerName,
  ownerEmail,
  editable,
  disabled,
  onAssign,
}: {
  requirementOwnerId: string | null;
  ownerName: string | null;
  ownerEmail: string | null;
  editable: boolean;
  disabled: boolean;
  onAssign: (ownerId: string | null) => void;
}) {
  const members = useOrganizationMembers();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner</CardTitle>
        <CardDescription>
          {ownerName ? `${ownerName} (${ownerEmail})` : "No owner assigned."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {editable ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="requirement-owner-select">Assign owner</Label>
            <Select
              id="requirement-owner-select"
              value={requirementOwnerId ?? ""}
              disabled={disabled || members.state.phase !== "ready"}
              onChange={(event) => onAssign(event.target.value === "" ? null : event.target.value)}
            >
              <option value="">Unassigned</option>
              {members.state.phase === "ready" &&
                members.state.data.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
                  </option>
                ))}
            </Select>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Ownership is fixed once a requirement is baselined or obsolete.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
