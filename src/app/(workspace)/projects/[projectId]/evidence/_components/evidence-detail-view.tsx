"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Lock, Pencil, ShieldCheck } from "lucide-react";
import { evidenceTypeLabel } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import {
  type EvidenceLinkDto,
  validateEvidence,
  useEvidence,
} from "@/lib/api/evidence";
import { PageHeader } from "@/components/common/page-header";
import { EvidenceStatusBadge } from "@/components/common/evidence-badges";
import { TraceLink } from "@/components/common/trace-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { EvidenceFormDialog } from "./evidence-form-dialog";
import { EvidenceTraceability } from "./evidence-traceability";
import { SupersedeEvidenceDialog } from "./supersede-evidence-dialog";

/** Human wording for the audit actions this module writes. */
const HISTORY_LABELS: Record<string, string> = {
  "evidence.created": "Recorded",
  "evidence.updated": "Content updated",
  "evidence.validated": "Validated",
  "evidence.superseded": "Superseded",
  "evidence.link_added": "Traceability link added",
  "evidence.link_removed": "Traceability link removed",
};

/**
 * Evidence detail.
 *
 * Holds one authoritative copy — whatever the API last returned. Every
 * mutation replaces it with the server's response, and the lifecycle
 * controls offer only the transitions the server said are legal.
 *
 * **What "integrity" means here.** This page can show who recorded and
 * validated this record, when, and its full audit history — that is record
 * integrity, and it is real. `sourceReference` is an external locator this
 * system does not verify. There is no file attached anywhere, and no hash or
 * checksum is displayed, because none exists: this is never a claim of file
 * integrity.
 */
export function EvidenceDetailView({ projectId, evidenceId }: { projectId: string; evidenceId: string }) {
  const { state, set, reload } = useEvidence(projectId, evidenceId);
  const project = useProject(projectId);
  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isSupersedeOpen, setIsSupersedeOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading evidence…" />;
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
          <Link href={`/projects/${projectId}/evidence`}>
            <ArrowLeft aria-hidden="true" />
            Back to evidence
          </Link>
        </Button>
      </div>
    );
  }

  const evidence = state.data;

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

  function handleLinksChanged(links: EvidenceLinkDto[]) {
    set({ ...evidence, links });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${evidence.identifier} — ${evidence.title}`}
        description={projectName ? `Evidence in ${projectName}.` : "Evidence detail."}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/evidence`}>
                <ArrowLeft aria-hidden="true" />
                All evidence
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={!evidence.editable.content}
              title={evidence.editable.content ? undefined : "Only a DRAFT record can be edited"}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/EVIDENCE/${evidence.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
            <TraceLink
              projectId={projectId}
              type="EVIDENCE"
              id={evidence.id}
              identifier={evidence.identifier}
              label={evidence.title}
            />
          </>
        }
      />

      {evidence.status !== "DRAFT" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {evidence.status === "VALIDATED"
              ? "This evidence is validated and its content is frozen — it is exactly what it was when it was validated."
              : "This evidence is superseded and read-only."}
          </span>
        </p>
      )}

      {evidence.supersededByRef && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm text-warning"
        >
          <span>
            Superseded by{" "}
            <Link
              href={`/projects/${projectId}/evidence/${evidence.supersededByRef.id}`}
              className="font-medium underline underline-offset-4"
            >
              {evidence.supersededByRef.identifier} — {evidence.supersededByRef.title}
            </Link>
            .
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
          <CardTitle>Evidence</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <Detail term="Identifier">
              <span className="font-mono">{evidence.identifier}</span>
            </Detail>
            <Detail term="Type">{evidenceTypeLabel(evidence.evidenceType)}</Detail>
            <Detail term="Status">
              <EvidenceStatusBadge status={evidence.status} />
            </Detail>
            <Detail term="Source reference">
              <span className="font-mono">{evidence.sourceReference}</span>
            </Detail>
            <Detail term="Recorded by">
              {evidence.recordedBy ? `${evidence.recordedBy.name} (${evidence.recordedBy.email})` : "Unknown"}
            </Detail>
            <Detail term="Validated by">
              {evidence.validatedBy
                ? `${evidence.validatedBy.name} (${evidence.validatedBy.email})`
                : "Not yet validated"}
            </Detail>
            <Detail term="Created">
              <span className="font-mono" title={evidence.createdAt}>
                {formatIsoDate(evidence.createdAt)}
              </span>
            </Detail>
            <Detail term="Updated">
              <span className="font-mono" title={evidence.updatedAt}>
                {formatIsoDate(evidence.updatedAt)}
              </span>
            </Detail>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">
              {evidence.description ?? "No description recorded."}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle</CardTitle>
          <CardDescription>
            {evidence.status === "DRAFT" &&
              "Draft — fully editable. Validate it to freeze its content, or supersede it directly."}
            {evidence.status === "VALIDATED" && "Validated — content is frozen. It may still be superseded."}
            {evidence.status === "SUPERSEDED" && "Superseded — terminal. No further transitions are possible."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {evidence.availableTransitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No further transitions are possible.</p>
          ) : (
            <>
              {evidence.availableTransitions.includes("VALIDATED") && (
                <Button
                  size="sm"
                  disabled={isBusy}
                  onClick={() => runAction(() => validateEvidence(projectId, evidence.id))}
                >
                  <ShieldCheck aria-hidden="true" />
                  Validate
                </Button>
              )}
              {evidence.availableTransitions.includes("SUPERSEDED") && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => setIsSupersedeOpen(true)}
                >
                  Supersede…
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <EvidenceTraceability
        projectId={projectId}
        evidenceId={evidence.id}
        links={evidence.links}
        editable={evidence.editable.links}
        onLinksChanged={handleLinksChanged}
      />

      <Card>
        <CardHeader>
          <CardTitle>Certification findings citing this evidence</CardTitle>
          <CardDescription>
            Read-only — set only through the certification workspace&apos;s own finding resolution,
            not from here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {evidence.citingFindings.length === 0 ? (
            <p className="text-sm text-muted-foreground">No certification finding cites this evidence.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {evidence.citingFindings.map((finding) => (
                <li key={finding.id} className="py-2 text-sm text-foreground">
                  <span className="font-mono">{finding.identifier}</span> — {finding.title}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <History className="size-4" aria-hidden="true" />
            History
          </CardTitle>
          <CardDescription>Audit events recorded against this evidence.</CardDescription>
        </CardHeader>
        <CardContent>
          {evidence.history.length === 0 ? (
            <p className="text-sm text-muted-foreground">No history recorded yet.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {evidence.history.map((event) => (
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

      <EvidenceFormDialog
        mode="edit"
        projectId={projectId}
        evidence={evidence}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />

      <SupersedeEvidenceDialog
        projectId={projectId}
        evidenceId={evidence.id}
        open={isSupersedeOpen}
        onOpenChange={setIsSupersedeOpen}
        onSuperseded={() => reload()}
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
