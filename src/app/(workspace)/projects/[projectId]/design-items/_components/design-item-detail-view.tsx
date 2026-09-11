"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, Network, Pencil } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { assignDesignItemOwner, useDesignItem } from "@/lib/api/artifacts";
import { useOrganizationMembers } from "@/lib/api/requirements";
import { DesignItemStatusBadge, DesignItemTypeBadge } from "@/components/common/artifact-badges";
import {
  ArtifactHistory,
  DetailField,
  LinkedRequirements,
  OwnerPanel,
} from "@/components/common/artifact-panels";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { formatIsoDate } from "@/lib/utils";
import { DesignItemFormDialog } from "./design-item-form-dialog";

/** Design item detail: the item, its owner, what is allocated to it, and its history. */
export function DesignItemDetailView({
  projectId,
  designItemId,
}: {
  projectId: string;
  designItemId: string;
}) {
  const { state, reload } = useDesignItem(projectId, designItemId);
  const members = useOrganizationMembers();
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading design item…" />;
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
          <Link href={`/projects/${projectId}/design-items`}>
            <ArrowLeft aria-hidden="true" />
            Back to design items
          </Link>
        </Button>
      </div>
    );
  }

  const item = state.data;

  async function handleAssignOwner(ownerId: string | null) {
    if (isBusy) return;
    setActionError(null);
    setIsBusy(true);

    try {
      await assignDesignItemOwner(projectId, item.id, ownerId);
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
        title={`${item.identifier} — ${item.name}`}
        description={item.description ?? "No description."}
        actions={
          <>
            <Button asChild variant="ghost">
              <Link href={`/projects/${projectId}/design-items`}>
                <ArrowLeft aria-hidden="true" />
                All design items
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </>
        }
      />

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
          <CardTitle>Design item</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{item.identifier}</span>
            </DetailField>
            <DetailField term="Type">
              <DesignItemTypeBadge itemType={item.itemType} />
            </DetailField>
            <DetailField term="Status">
              <DesignItemStatusBadge status={item.status} />
            </DetailField>
            <DetailField term="Owner">{item.owner ? item.owner.name : "Unassigned"}</DetailField>
            <DetailField term="Created">
              <span className="font-mono" title={item.createdAt}>
                {formatIsoDate(item.createdAt)}
              </span>
            </DetailField>
            <DetailField term="Updated">
              <span className="font-mono" title={item.updatedAt}>
                {formatIsoDate(item.updatedAt)}
              </span>
            </DetailField>
          </dl>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <OwnerPanel
          ownerName={item.owner?.name ?? null}
          ownerEmail={item.owner?.email ?? null}
          ownerId={item.ownerId}
          members={members.state.phase === "ready" ? members.state.data : []}
          disabled={isBusy || members.state.phase !== "ready"}
          onAssign={handleAssignOwner}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network className="size-4" aria-hidden="true" />
              Hierarchy
            </CardTitle>
            <CardDescription>Parent and child relationships between design items.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Hierarchy relationships are not managed yet. The schema supports them, but no
              interface creates or edits them, so nothing is shown here rather than an empty tree
              that implies otherwise.
            </p>
          </CardContent>
        </Card>
      </div>

      <LinkedRequirements
        projectId={projectId}
        requirements={item.requirements}
        emptyMessage="No requirements are allocated to this item yet. Allocate one from a requirement's traceability panel."
      />

      {item.decisions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Related decisions</CardTitle>
            <CardDescription>
              Decisions already recorded against this item. The decisions module is not built yet,
              so these are read-only.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {item.decisions.map((decision) => (
                <li key={decision.id} className="py-2.5 text-sm text-foreground">
                  <span className="font-mono">{decision.identifier}</span> — {decision.title}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <ArtifactHistory events={item.history} />

      <DesignItemFormDialog
        mode="edit"
        projectId={projectId}
        designItem={item}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}
