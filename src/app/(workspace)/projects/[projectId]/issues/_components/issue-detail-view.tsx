"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Lock, Pencil } from "lucide-react";
import type { IssueStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type IssueLinkDto, assignIssueOwner, transitionIssue, useIssue } from "@/lib/api/issues";
import { useProject } from "@/lib/api/projects";
import { useOrganizationMembers } from "@/lib/api/requirements";
import { PageHeader } from "@/components/common/page-header";
import {
  IssueSeverityBadge,
  IssueStatusBadge,
  issueStatusLabel,
} from "@/components/common/risk-issue-badges";
import { TraceLink } from "@/components/common/trace-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";
import { IssueFormDialog } from "./issue-form-dialog";
import { IssueTraceability } from "./issue-traceability";

/** Human wording for the audit actions this module writes. */
const HISTORY_LABELS: Record<string, string> = {
  "issue.created": "Created",
  "issue.updated": "Content updated",
  "issue.status_transitioned": "Status changed",
  "issue.owner_assigned": "Owner assigned",
  "issue.owner_cleared": "Owner cleared",
  "issue.link_added": "Traceability link added",
  "issue.link_removed": "Traceability link removed",
};

const TRANSITION_LABELS: Record<IssueStatus, string> = {
  OPEN: "Reopen",
  IN_PROGRESS: "Start work",
  RESOLVED: "Mark resolved",
  CLOSED: "Close",
};

/**
 * Issue detail.
 *
 * Holds one authoritative copy — whatever the API last returned. Every
 * mutation replaces it with the server's response, and the lifecycle
 * controls offer only the transitions the server said are legal, so the UI
 * cannot present a move that would be rejected. Severity is shown exactly as
 * recorded — nothing here ranks issues against each other.
 */
export function IssueDetailView({ projectId, issueId }: { projectId: string; issueId: string }) {
  const { state, set, reload } = useIssue(projectId, issueId);
  const project = useProject(projectId);
  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading issue…" />;
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
          <Link href={`/projects/${projectId}/issues`}>
            <ArrowLeft aria-hidden="true" />
            Back to issues
          </Link>
        </Button>
      </div>
    );
  }

  const issue = state.data;

  async function runAction(action: () => Promise<unknown>) {
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

  function handleLinksChanged(links: IssueLinkDto[]) {
    set({ ...issue, links });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${issue.identifier} — ${issue.title}`}
        description={projectName ? `Issue in ${projectName}.` : "Issue detail."}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/issues`}>
                <ArrowLeft aria-hidden="true" />
                All issues
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={!issue.editable.content}
              title={
                issue.editable.content
                  ? undefined
                  : `An issue that is ${issueStatusLabel(issue.status)} cannot be edited`
              }
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/ISSUE/${issue.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
            <TraceLink
              projectId={projectId}
              type="ISSUE"
              id={issue.id}
              identifier={issue.identifier}
              label={issue.title}
            />
          </>
        }
      />

      {!issue.editable.content && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This issue is {issueStatusLabel(issue.status).toLowerCase()} and its content is
            read-only — editing it would quietly rewrite what was actually found. The server
            enforces this regardless of what the interface offers.
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
          <CardTitle>Issue</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail term="Identifier">
              <span className="font-mono">{issue.identifier}</span>
            </Detail>
            <Detail term="Severity">
              <IssueSeverityBadge severity={issue.severity} />
            </Detail>
            <Detail term="Status">
              <IssueStatusBadge status={issue.status} />
            </Detail>
            <Detail term="Created">
              <span className="font-mono" title={issue.createdAt}>
                {formatIsoDate(issue.createdAt)}
              </span>
            </Detail>
            <Detail term="Updated">
              <span className="font-mono" title={issue.updatedAt}>
                {formatIsoDate(issue.updatedAt)}
              </span>
            </Detail>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">{issue.description}</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Lifecycle</CardTitle>
            <CardDescription>
              Currently {issueStatusLabel(issue.status).toLowerCase()}. Only valid next states are
              offered.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {issue.availableTransitions.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                This issue is closed — no further transitions are possible.
              </p>
            ) : (
              issue.availableTransitions.map((next) => (
                <Button
                  key={next}
                  variant={next === "CLOSED" ? "outline" : "default"}
                  size="sm"
                  disabled={isBusy}
                  onClick={() => runAction(() => transitionIssue(projectId, issue.id, next))}
                >
                  {TRANSITION_LABELS[next]}
                </Button>
              ))
            )}
          </CardContent>
        </Card>

        <OwnerCard
          ownerId={issue.ownerId}
          ownerName={issue.owner?.name ?? null}
          ownerEmail={issue.owner?.email ?? null}
          editable={issue.editable.owner}
          disabled={isBusy}
          onAssign={(ownerId) => runAction(() => assignIssueOwner(projectId, issue.id, ownerId))}
        />
      </div>

      <IssueTraceability
        projectId={projectId}
        issueId={issue.id}
        links={issue.links}
        editable={issue.editable.links}
        onLinksChanged={handleLinksChanged}
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            History
          </CardTitle>
          <CardDescription>Audit events recorded against this issue.</CardDescription>
        </CardHeader>
        <CardContent>
          {issue.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {issue.history.map((event) => (
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

      <IssueFormDialog
        mode="edit"
        projectId={projectId}
        issue={issue}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
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
  ownerId,
  ownerName,
  ownerEmail,
  editable,
  disabled,
  onAssign,
}: {
  ownerId: string | null;
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
        <CardDescription>{ownerName ? `${ownerName} (${ownerEmail})` : "No owner assigned."}</CardDescription>
      </CardHeader>
      <CardContent>
        {editable ? (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="issue-owner-select">Assign owner</Label>
            <Select
              id="issue-owner-select"
              value={ownerId ?? ""}
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
          <p className="text-sm text-muted-foreground">Ownership is fixed once an issue is closed.</p>
        )}
      </CardContent>
    </Card>
  );
}
