"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Pencil } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useStakeholderNeed } from "@/lib/api/artifacts";
import { StakeholderNeedStatusBadge } from "@/components/common/artifact-badges";
import { ArtifactHistory, DetailField, LinkedRequirements } from "@/components/common/artifact-panels";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { StakeholderNeedFormDialog } from "./stakeholder-need-form-dialog";

/** Stakeholder need detail: the need itself, what derives from it, and its history. */
export function StakeholderNeedDetailView({
  projectId,
  needId,
}: {
  projectId: string;
  needId: string;
}) {
  const { state, reload } = useStakeholderNeed(projectId, needId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading stakeholder need…" />;
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
          <Link href={`/projects/${projectId}/stakeholder-needs`}>
            <ArrowLeft aria-hidden="true" />
            Back to stakeholder needs
          </Link>
        </Button>
      </div>
    );
  }

  const need = state.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`${need.identifier} — ${need.title}`}
        description={`Requested by ${need.stakeholder}.`}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/stakeholder-needs`}>
                <ArrowLeft aria-hidden="true" />
                All needs
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${projectId}/history/STAKEHOLDER_NEED/${need.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Need</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{need.identifier}</span>
            </DetailField>
            <DetailField term="Status">
              <StakeholderNeedStatusBadge status={need.status} />
            </DetailField>
            <DetailField term="Created">
              <span className="font-mono" title={need.createdAt}>
                {formatIsoDate(need.createdAt)}
              </span>
            </DetailField>
            <DetailField term="Updated">
              <span className="font-mono" title={need.updatedAt}>
                {formatIsoDate(need.updatedAt)}
              </span>
            </DetailField>
          </dl>

          <div className="flex flex-col gap-1">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Description
            </h3>
            <p className="whitespace-pre-wrap text-sm text-foreground">{need.description}</p>
          </div>
        </CardContent>
      </Card>

      <LinkedRequirements
        projectId={projectId}
        requirements={need.requirements}
        emptyMessage="No requirements derive from this need yet. Link one from a requirement's traceability panel."
      />

      <ArtifactHistory events={need.history} />

      <StakeholderNeedFormDialog
        mode="edit"
        projectId={projectId}
        need={need}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}
